import datetime
import logging
import re
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from app.services.vector_store import AsyncSessionLocal, Chunk, HealthReport, Repo
from app.routers.graph import get_repository_graph

router = APIRouter()
logger = logging.getLogger(__name__)

# Token match regex for decision points
PYTHON_DECISION_PAT = re.compile(r"\b(if|elif|else|for|while|try|except|with|and|or)\b")
JSTS_DECISION_PAT = re.compile(r"\b(if|else|for|while|catch)\b|&&|\|\|")
GENERIC_DECISION_PAT = re.compile(r"\b(if|else|for|while)\b")

def compute_decision_points(content: str, language: str) -> int:
    lang = language.lower()
    if lang in ("python", "py"):
        matches = PYTHON_DECISION_PAT.findall(content)
        return len(matches)
    elif lang in ("javascript", "typescript", "js", "ts", "tsx", "jsx"):
        matches = JSTS_DECISION_PAT.findall(content)
        return len(matches)
    else:
        matches = GENERIC_DECISION_PAT.findall(content)
        return len(matches)

def analyze_comments(content: str, language: str):
    lines = content.splitlines()
    total_lines = len(lines)
    if total_lines == 0:
        return 0, 0, False
        
    doc_lines = 0
    lang = language.lower()
    
    if lang in ("python", "py"):
        in_triple_single = False
        in_triple_double = False
        
        for line in lines:
            stripped = line.strip()
            # Check single line comment outside of triple quotes
            if not in_triple_single and not in_triple_double and stripped.startswith("#"):
                doc_lines += 1
                continue
                
            # Parse triple quotes toggle state machine
            idx = 0
            while idx < len(line):
                if not in_triple_single and not in_triple_double:
                    if line[idx:idx+3] == '"""':
                        in_triple_double = True
                        idx += 3
                    elif line[idx:idx+3] == "'''":
                        in_triple_single = True
                        idx += 3
                    else:
                        idx += 1
                elif in_triple_double:
                    if line[idx:idx+3] == '"""':
                        in_triple_double = False
                        idx += 3
                    else:
                        idx += 1
                elif in_triple_single:
                    if line[idx:idx+3] == "'''":
                        in_triple_single = False
                        idx += 3
                    else:
                        idx += 1
            if in_triple_single or in_triple_double or '"""' in line or "'''" in line:
                doc_lines += 1
                
    elif lang in ("javascript", "typescript", "js", "ts", "tsx", "jsx"):
        in_block_comment = False
        for line in lines:
            stripped = line.strip()
            if not in_block_comment and stripped.startswith("//"):
                doc_lines += 1
                continue
                
            idx = 0
            while idx < len(line):
                if not in_block_comment:
                    if line[idx:idx+2] == "/*":
                        in_block_comment = True
                        idx += 2
                    else:
                        idx += 1
                else:
                    if line[idx:idx+2] == "*/":
                        in_block_comment = False
                        idx += 2
                    else:
                        idx += 1
            if in_block_comment or "/*" in line or "*/" in line:
                doc_lines += 1
    else:
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("#") or stripped.startswith("//"):
                doc_lines += 1
                
    has_docstrings = doc_lines > 0
    return doc_lines, total_lines, has_docstrings

def compute_dependency_depth_metrics(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]):
    if not nodes:
        return 1, 1.0
        
    adj = {node["id"]: [] for node in nodes}
    for edge in edges:
        src = edge["source"]
        tgt = edge["target"]
        if src in adj and tgt in adj:
            adj[src].append(tgt)
            
    memo = {}
    
    def dfs(u, visiting):
        if u in memo:
            return memo[u]
        if u in visiting:
            return 0  # cycle detected
            
        visiting.add(u)
        max_child_depth = 0
        for v in adj.get(u, []):
            max_child_depth = max(max_child_depth, dfs(v, visiting))
        visiting.remove(u)
        
        memo[u] = 1 + max_child_depth
        return memo[u]
        
    max_depth = 0
    total_depth = 0
    for node in nodes:
        node_id = node["id"]
        depth = dfs(node_id, set())
        max_depth = max(max_depth, depth)
        total_depth += depth
        
    avg_depth = total_depth / len(nodes) if nodes else 1.0
    return max_depth, avg_depth

@router.post("/health/{repo_id}")
async def compute_health_report(repo_id: int):
    """
    Computes code health metrics (Complexity, Documentation, Test Coverage, Dependency Graph Depth)
    for a repository and caches the report.
    """
    async with AsyncSessionLocal() as session:
        # Check cache
        cache_stmt = select(HealthReport).where(HealthReport.repo_id == repo_id)
        cache_res = await session.execute(cache_stmt)
        cached_report = cache_res.scalars().first()
        
        if cached_report:
            age = datetime.datetime.utcnow() - cached_report.computed_at
            if age < datetime.timedelta(hours=1):
                logger.info(f"Returning cached health report for repo_id {repo_id}")
                return cached_report.report_json

        # Fetch repo existence check
        repo_stmt = select(Repo).where(Repo.id == repo_id)
        repo_res = await session.execute(repo_stmt)
        repo = repo_res.scalars().first()
        if not repo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Repository with ID {repo_id} not found."
            )

        # Retrieve chunks
        stmt = select(Chunk).where(Chunk.repo_id == repo_id)
        result = await session.execute(stmt)
        chunks = list(result.scalars().all())
        
        if not chunks:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No chunks found for the given repository. Please ingest the repository first."
            )

        # Group chunks by file_path
        files_chunks: Dict[str, List[Chunk]] = {}
        for chunk in chunks:
            files_chunks.setdefault(chunk.file_path, []).append(chunk)

        # A) CYCLOMATIC COMPLEXITY
        file_complexities = []
        total_complexity_sum = 0
        
        for file_path, f_chunks in files_chunks.items():
            chunk_complexities = []
            for chunk in f_chunks:
                comp = 1 + compute_decision_points(chunk.content, chunk.language)
                chunk_complexities.append(comp)
            
            avg_file_comp = sum(chunk_complexities) / len(chunk_complexities) if chunk_complexities else 1.0
            
            if avg_file_comp <= 5:
                rating = "Low"
            elif avg_file_comp <= 10:
                rating = "Medium"
            else:
                rating = "High"
                
            file_complexities.append({
                "file_path": file_path,
                "average_complexity": round(avg_file_comp, 1),
                "rating": rating,
                "chunk_count": len(f_chunks)
            })
            total_complexity_sum += avg_file_comp
            
        repo_avg_complexity = total_complexity_sum / len(file_complexities) if file_complexities else 1.0
        
        if repo_avg_complexity <= 1:
            comp_score = 100
        else:
            comp_score = max(0, 100 - int((repo_avg_complexity - 1) * 8))
            
        if repo_avg_complexity <= 5:
            comp_rating = "Low"
        elif repo_avg_complexity <= 10:
            comp_rating = "Medium"
        else:
            comp_rating = "High"

        # B) DOCUMENTATION DENSITY
        file_docs = []
        docstring_count = 0
        total_functions = 0
        total_doc_lines = 0
        total_repo_lines = 0
        
        for file_path, f_chunks in files_chunks.items():
            file_doc_lines = 0
            file_total_lines = 0
            file_has_doc = False
            
            for chunk in f_chunks:
                doc_l, tot_l, has_doc = analyze_comments(chunk.content, chunk.language)
                file_doc_lines += doc_l
                file_total_lines += tot_l
                
                # Formula check: count total functions/classes/components and those documented
                if chunk.kind in ("function", "class", "component"):
                    total_functions += 1
                    if has_doc:
                        docstring_count += 1
                        
            doc_ratio = file_doc_lines / file_total_lines if file_total_lines > 0 else 0.0
            file_has_doc = file_doc_lines > 0
            
            file_docs.append({
                "file_path": file_path,
                "has_docstrings": file_has_doc,
                "doc_ratio": round(doc_ratio, 2)
            })
            total_doc_lines += file_doc_lines
            total_repo_lines += file_total_lines

        if total_functions > 0:
            density_percent = (docstring_count / total_functions) * 100
        else:
            density_percent = (total_doc_lines / total_repo_lines * 100) if total_repo_lines > 0 else 0.0
            
        doc_score = int(density_percent)
        
        if density_percent >= 80:
            doc_rating = "Good"
        elif density_percent >= 40:
            doc_rating = "Fair"
        else:
            doc_rating = "Poor"

        # C) TEST COVERAGE SIGNAL
        test_file_list = []
        source_file_list = []
        for f_path in files_chunks.keys():
            fname = f_path.split("/")[-1].lower()
            if "test" in fname or "spec" in fname:
                test_file_list.append(f_path)
            else:
                source_file_list.append(f_path)
                
        test_files_count = len(test_file_list)
        source_files_count = len(source_file_list)
        
        if source_files_count > 0:
            ratio_percent = (test_files_count / source_files_count) * 100
        else:
            ratio_percent = 100.0 if test_files_count > 0 else 0.0
            
        if ratio_percent >= 50:
            test_rating = "Good"
            test_score = min(100, int(90.0 + (ratio_percent - 50.0) * 0.2))
        elif ratio_percent >= 20:
            test_rating = "Fair"
            test_score = int(50.0 + (ratio_percent - 20.0) * (40.0 / 30.0))
        else:
            test_rating = "Poor"
            test_score = int(ratio_percent * 2.5)

        # D) DEPENDENCY DEPTH
        try:
            graph_data = await get_repository_graph(repo_id)
            nodes = graph_data.get("nodes", [])
            edges = graph_data.get("edges", [])
            max_depth, avg_depth = compute_dependency_depth_metrics(nodes, edges)
        except Exception as e:
            logger.error(f"Failed to calculate dependency graph depth for repo_id {repo_id}: {e}")
            max_depth, avg_depth = 1, 1.0
            
        if max_depth <= 3:
            dep_rating = "Shallow"
        elif max_depth <= 6:
            dep_rating = "Moderate"
        else:
            dep_rating = "Deep"
            
        if max_depth <= 1:
            dep_score = 100
        else:
            dep_score = max(0, 100 - (max_depth - 1) * 10)

        # E) OVERALL HEALTH SCORE
        overall_score = round(comp_score * 0.3 + doc_score * 0.25 + test_score * 0.25 + dep_score * 0.2)
        
        # Grading Scale
        if overall_score >= 90:
            grade = "A"
        elif overall_score >= 70:
            grade = "B"
        elif overall_score >= 55:
            grade = "C"
        elif overall_score >= 40:
            grade = "D"
        else:
            grade = "F"

        # Generate Top Issues list
        top_issues = []
        
        # Sort files by complexity descending to find problematic files
        sorted_comp_files = sorted(file_complexities, key=lambda x: x["average_complexity"], reverse=True)
        for f_comp in sorted_comp_files[:3]:
            if f_comp["average_complexity"] >= 11:
                top_issues.append({
                    "severity": "critical",
                    "message": f"{f_comp['file_path']} has critical cyclomatic complexity (avg {f_comp['average_complexity']:.1f})"
                })
            elif f_comp["average_complexity"] >= 6:
                top_issues.append({
                    "severity": "warning",
                    "message": f"{f_comp['file_path']} has high cyclomatic complexity (avg {f_comp['average_complexity']:.1f})"
                })
                
        # Sorted files by doc_ratio ascending to find undocumented files
        sorted_doc_files = sorted(file_docs, key=lambda x: x["doc_ratio"])
        for f_doc in sorted_doc_files[:3]:
            # Skip test files since they usually don't need heavy documentation
            fname = f_doc["file_path"].split("/")[-1].lower()
            if "test" in fname or "spec" in fname:
                continue
                
            if f_doc["doc_ratio"] < 0.2:
                top_issues.append({
                    "severity": "warning",
                    "message": f"{f_doc['file_path']} has very low documentation density ({int(f_doc['doc_ratio']*100)}%)"
                })
            elif f_doc["doc_ratio"] < 0.4:
                top_issues.append({
                    "severity": "info",
                    "message": f"{f_doc['file_path']} has low documentation density ({int(f_doc['doc_ratio']*100)}%)"
                })

        if ratio_percent < 5:
            top_issues.append({
                "severity": "critical",
                "message": f"Extremely low test files presence in repository ({ratio_percent:.1f}%)"
            })
        elif ratio_percent < 20:
            top_issues.append({
                "severity": "warning",
                "message": f"Test file ratio is low ({ratio_percent:.1f}%)"
            })

        if max_depth >= 10:
            top_issues.append({
                "severity": "critical",
                "message": f"Extremely deep dependency chain detected (max depth {max_depth})"
            })
        elif max_depth >= 7:
            top_issues.append({
                "severity": "warning",
                "message": f"Deep dependency chain detected (max depth {max_depth})"
            })

        report_json = {
            "repo_id": repo_id,
            "overall_score": overall_score,
            "grade": grade,
            "metrics": {
                "complexity": {
                    "score": comp_score,
                    "rating": comp_rating,
                    "average": round(repo_avg_complexity, 1),
                    "files": file_complexities
                },
                "documentation": {
                    "score": doc_score,
                    "rating": doc_rating,
                    "density_percent": round(density_percent, 1),
                    "files": file_docs
                },
                "test_coverage": {
                    "score": test_score,
                    "rating": test_rating,
                    "test_files": test_files_count,
                    "source_files": source_files_count,
                    "ratio_percent": round(ratio_percent, 1),
                    "test_file_list": test_file_list
                },
                "dependency_depth": {
                    "score": dep_score,
                    "rating": dep_rating,
                    "max_depth": max_depth,
                    "avg_depth": round(avg_depth, 1)
                }
            },
            "top_issues": top_issues
        }

        # Cache in db
        if cached_report:
            cached_report.computed_at = datetime.datetime.utcnow()
            cached_report.report_json = report_json
        else:
            new_report = HealthReport(
                repo_id=repo_id,
                computed_at=datetime.datetime.utcnow(),
                report_json=report_json
            )
            session.add(new_report)
            
        await session.commit()
        return report_json

@router.get("/health/{repo_id}")
async def get_health_report(repo_id: int):
    """
    Returns the cached health report for a repository.
    """
    async with AsyncSessionLocal() as session:
        stmt = select(HealthReport).where(HealthReport.repo_id == repo_id)
        res = await session.execute(stmt)
        cached_report = res.scalars().first()
        
        if not cached_report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No health report found. Run POST /health/{repo_id} first."
            )
            
        return cached_report.report_json
