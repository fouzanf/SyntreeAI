import logging
from typing import Set, Optional, List, Dict
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from app.services.vector_store import AsyncSessionLocal, Chunk

router = APIRouter()
logger = logging.getLogger(__name__)

EXTERNAL_PACKAGES = {
    "react", "react-dom", "next", "framer-motion", "d3", "three", 
    "@react-three", "lucide-react", "tailwindcss", "typescript"
}

def should_skip_import(import_path: str) -> bool:
    import_path = import_path.strip().lower()
    
    # Check if exact match with external packages
    if import_path in EXTERNAL_PACKAGES:
        return True
        
    # Check if starts with a package in EXTERNAL_PACKAGES followed by /
    for pkg in EXTERNAL_PACKAGES:
        if import_path.startswith(pkg + "/"):
            return True
            
    # Check if starts with @ but not @/
    if import_path.startswith("@") and not import_path.startswith("@/"):
        return True
        
    return False

def get_file_keys(f: str) -> Set[str]:
    """
    Generate all possible keys for how a file could be imported.
    All keys are returned in lowercase for case-insensitive matching.
    """
    keys = set()
    f_norm = f.replace("\\", "/").strip("/")
    if not f_norm:
        return keys

    # Add raw normalized path and full path without extension
    keys.add(f_norm)
    if "." in f_norm:
        f_no_ext = f_norm.rsplit(".", 1)[0]
    else:
        f_no_ext = f_norm
    keys.add(f_no_ext)
    
    # Strip "src/" prefix if present
    f_stripped = f_norm
    if f_norm.startswith("src/"):
        f_stripped = f_norm[4:]
        keys.add(f_stripped)
        if "." in f_stripped:
            keys.add(f_stripped.rsplit(".", 1)[0])
            
    # Dot notation version of full and stripped paths
    keys.add(f_norm.replace("/", "."))
    if "." in f_norm:
        keys.add(f_no_ext.replace("/", "."))
    keys.add(f_stripped.replace("/", "."))
    if "." in f_stripped:
        keys.add(f_stripped.rsplit(".", 1)[0].replace("/", "."))

    # Filename and filename without extension
    parts = f_norm.split("/")
    filename = parts[-1]
    keys.add(filename)
    if "." in filename:
        filename_no_ext = filename.rsplit(".", 1)[0]
        keys.add(filename_no_ext)

    # General suffix generator (all suffixes)
    for i in range(len(parts)):
        subpath = "/".join(parts[i:])
        keys.add(subpath)
        keys.add(subpath.replace("/", "."))
        if "." in subpath:
            subpath_no_ext = subpath.rsplit(".", 1)[0]
            keys.add(subpath_no_ext)
            keys.add(subpath_no_ext.replace("/", "."))

    # Special handling for __init__.py
    if f_norm.endswith("/__init__.py") or f_norm == "__init__.py":
        # Package directory path
        if f_norm.endswith("/__init__.py"):
            dir_path = f_norm.rsplit("/__init__.py", 1)[0]
        else:
            dir_path = ""
            
        if dir_path:
            keys.add(dir_path)
            keys.add(dir_path.replace("/", "."))
            # Strip "src/" from directory path
            dir_stripped = dir_path
            if dir_path.startswith("src/"):
                dir_stripped = dir_path[4:]
                keys.add(dir_stripped)
                keys.add(dir_stripped.replace("/", "."))
                
            # Last component of directory (e.g. "pytz")
            dir_last = dir_path.split("/")[-1]
            keys.add(dir_last)
            dir_stripped_last = dir_stripped.split("/")[-1]
            keys.add(dir_stripped_last)

    # Special handling for JS/TS index files
    for index_suffix in ["/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/index"]:
        if f_norm.endswith(index_suffix):
            dir_path = f_norm.rsplit(index_suffix, 1)[0]
            keys.add(dir_path)
            keys.add(dir_path.replace("/", "."))
            dir_stripped = dir_path
            if dir_path.startswith("src/"):
                dir_stripped = dir_path[4:]
                keys.add(dir_stripped)
                keys.add(dir_stripped.replace("/", "."))
            dir_last = dir_path.split("/")[-1]
            keys.add(dir_last)

    # Lowercase all keys for case-insensitive matching
    return {k.lower() for k in keys if k}

def get_import_candidates(imp: str, source_file: str) -> Set[str]:
    """
    Extract possible import names/paths from import statement.
    All candidates are returned in lowercase.
    """
    candidates = set()
    imp_clean = imp.strip()
    if not imp_clean:
        return candidates

    # Clean quotes/whitespace general fallbacks
    imp_clean_unquoted = imp_clean.replace("'", "").replace('"', "").replace("`", "")
    candidates.add(imp_clean)
    candidates.add(imp_clean.replace(".", "/"))
    candidates.add(imp_clean_unquoted)
    candidates.add(imp_clean_unquoted.replace(".", "/"))

    # Check for quotes (JS/TS style)
    quotes = [q for q in ["'", '"', '`'] if q in imp_clean]
    if quotes:
        import_path = None
        for q in quotes:
            parts = imp_clean.split(q)
            if len(parts) >= 3:
                import_path = parts[1]
                break
        if import_path:
            # Check if we should skip this external package
            if should_skip_import(import_path):
                return set()
                
            # Base paths to check
            base_paths = []
            import_path_norm = import_path.replace("\\", "/")
            
            # 1. Resolve relative path
            if import_path_norm.startswith("./") or import_path_norm.startswith("../"):
                source_dir = "/".join(source_file.replace("\\", "/").split("/")[:-1])
                parts = import_path_norm.split("/")
                dir_parts = source_dir.split("/") if source_dir else []
                for p in parts:
                    if p == ".":
                        continue
                    elif p == "..":
                        if dir_parts:
                            dir_parts.pop()
                    else:
                        dir_parts.append(p)
                resolved = "/".join(dir_parts).strip("/")
                base_paths.append(resolved)
                
            # 2. Strip leading ./ and ../
            stripped_path = import_path_norm
            while stripped_path.startswith("./") or stripped_path.startswith("../"):
                if stripped_path.startswith("./"):
                    stripped_path = stripped_path[2:]
                elif stripped_path.startswith("../"):
                    stripped_path = stripped_path[3:]
            base_paths.append(stripped_path.strip("/"))
            
            # 3. Handle @ alias (relative to project root)
            if import_path_norm.startswith("@"):
                if import_path_norm.startswith("@/"):
                    alias_path = import_path_norm[2:]
                else:
                    alias_path = import_path_norm[1:]
                base_paths.append(alias_path.strip("/"))
                
            # 4. Add raw normalized path itself
            base_paths.append(import_path_norm.strip("/"))

            # Try variants for all base paths
            for bp in base_paths:
                if not bp:
                    continue
                candidates.add(bp)
                candidates.add(bp.replace("/", "."))
                # Add extensions
                for ext in [".tsx", ".ts", ".jsx", ".js"]:
                    candidates.add(bp + ext)
                    candidates.add((bp + ext).replace("/", "."))
                # Add index files
                for ext in ["/index.tsx", "/index.ts", "/index.jsx", "/index.js"]:
                    candidates.add(bp + ext)
                    candidates.add((bp + ext).replace("/", "."))
                candidates.add(bp + "/index")
                candidates.add((bp + "/index").replace("/", "."))
    else:
        # Python style (no quotes)
        if imp_clean.startswith("from ") and " import " in imp_clean:
            parts = imp_clean.split(" import ", 1)
            module_part = parts[0][5:].strip()
            names_part = parts[1].strip()
            names_part = names_part.replace("(", "").replace(")", "")
            imported_names = [n.split(" as ")[0].strip() for n in names_part.split(",")]
            
            if module_part.startswith("."):
                dots_count = 0
                for char in module_part:
                    if char == ".":
                        dots_count += 1
                    else:
                        break
                rest = module_part[dots_count:]
                
                source_dir = "/".join(source_file.replace("\\", "/").split("/")[:-1])
                dir_parts = source_dir.split("/") if source_dir else []
                if dots_count > 1:
                    for _ in range(dots_count - 1):
                        if dir_parts:
                            dir_parts.pop()
                if rest:
                    rest_path = rest.replace(".", "/")
                    resolved_base = "/".join(dir_parts + [rest_path]) if dir_parts else rest_path
                else:
                    resolved_base = "/".join(dir_parts)
                resolved_base = resolved_base.strip("/")
                
                candidates.add(resolved_base)
                candidates.add(resolved_base.replace("/", "."))
                for name in imported_names:
                    if name:
                        candidates.add(f"{resolved_base}/{name}")
                        candidates.add(f"{resolved_base}.{name}")
            else:
                candidates.add(module_part)
                candidates.add(module_part.replace(".", "/"))
                # Add last component of module part (e.g. "exceptions" from "pytz.exceptions")
                if "." in module_part:
                    candidates.add(module_part.split(".")[-1])
                for name in imported_names:
                    if name:
                        candidates.add(f"{module_part}.{name}")
                        candidates.add(f"{module_part}/{name}".replace(".", "/"))
        elif imp_clean.startswith("import ") and " from " not in imp_clean:
            names_part = imp_clean[7:].strip()
            names = [n.split(" as ")[0].strip() for n in names_part.split(",")]
            for name in names:
                if name:
                    candidates.add(name)
                    candidates.add(name.replace(".", "/"))

    return {c.lower() for c in candidates if c}

@router.get("/debug/imports/{repo_id}")
async def get_debug_imports(repo_id: int):
    """
    Debug endpoint to see raw import data.
    """
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Chunk.file_path, Chunk.imports)
                .where(Chunk.repo_id == repo_id)
            )
            chunks_data = result.all()
            
            return [
                {
                    "file_path": row[0],
                    "raw_imports": row[1]
                }
                for row in chunks_data
            ]
    except Exception as e:
        logger.error(f"Error fetching debug imports for repo_id {repo_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch debug imports: {str(e)}",
        )

@router.get("/graph/{repo_id}")
async def get_repository_graph(repo_id: int):
    try:
        async with AsyncSessionLocal() as session:
            # Fetch file paths, imports and languages for all chunks of the repository
            result = await session.execute(
                select(Chunk.file_path, Chunk.imports, Chunk.language)
                .where(Chunk.repo_id == repo_id)
            )
            chunks_data = result.all()

            if not chunks_data:
                return {"nodes": [], "edges": []}

            # 1. Build Nodes mapping (aggregating chunk counts)
            nodes_map = {}
            for row in chunks_data:
                file_path, imports, language = row
                if file_path not in nodes_map:
                    nodes_map[file_path] = {
                        "id": file_path,
                        "language": language,
                        "chunk_count": 0
                    }
                nodes_map[file_path]["chunk_count"] += 1

            # 2. Build Edges (resolving imports to internal file nodes)
            all_files = set(nodes_map.keys())
            
            # Build lookup map
            lookup_map = {}
            for f in all_files:
                keys = get_file_keys(f)
                for k in keys:
                    lookup_map[k] = f
                    
            edges_set = set()
            total_imports = 0
            resolved_imports = 0
            
            for row in chunks_data:
                file_path, imports, language = row
                for imp in imports:
                    total_imports += 1
                    candidates = get_import_candidates(imp, file_path)
                    resolved = None
                    for c in candidates:
                        if c in lookup_map:
                            resolved = lookup_map[c]
                            break
                    if resolved:
                        resolved_imports += 1
                        if resolved != file_path:
                            edges_set.add((file_path, resolved))
                            
            edges = [{"source": src, "target": tgt} for src, tgt in edges_set]
            
            # Log debug output
            logger.info(
                f"Dependency Graph compilation for repo_id {repo_id}: "
                f"found {total_imports} imports, "
                f"resolved {resolved_imports} to internal files, "
                f"created {len(edges)} edges."
            )
            
            # Fallback debug logging if edges created is 0
            if len(edges) == 0 and total_imports > 0:
                flat_imports_list = []
                for row in chunks_data:
                    if row[1]:
                        flat_imports_list.extend(row[1])
                logger.warning(
                    f"Zero edges created for repo_id {repo_id}. "
                    f"First 20 raw imports metadata from chunks: "
                    f"{flat_imports_list[:20]}"
                )

            nodes = list(nodes_map.values())

            return {
                "nodes": nodes,
                "edges": edges
            }

    except Exception as e:
        logger.error(f"Error compiling dependency graph for repo_id {repo_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate dependency graph: {str(e)}",
        )
