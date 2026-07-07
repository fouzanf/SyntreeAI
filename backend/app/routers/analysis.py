import json
import logging
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from google import genai
from google.genai import types
from app.config import settings
from app.services.vector_store import AsyncSessionLocal, Chunk

router = APIRouter()
logger = logging.getLogger(__name__)

# Initialize GenAI Client
client = genai.Client(api_key=settings.gemini_api_key)
model = "gemini-3.5-flash"

@router.post("/analyze/{repo_id}")
async def analyze_repository(repo_id: int):
    """
    Retrieves all repository chunks, batches them under 800k tokens,
    calls Gemini to diagnose code smells, and streams findings batch-by-batch via SSE.
    """
    try:
        async with AsyncSessionLocal() as session:
            # Retrieve basic details of all chunks for full codebase coverage analysis
            result = await session.execute(
                select(Chunk.file_path, Chunk.start_line, Chunk.end_line, Chunk.content, Chunk.language)
                .where(Chunk.repo_id == repo_id)
            )
            chunks = result.all()
    except Exception as e:
        logger.error(f"Failed to query chunks from database for repo_id {repo_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve repository chunks: {str(e)}"
        )

    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No chunks found for the given repository ID."
        )

    async def event_generator():
        # Group chunks into manageable batches (e.g., 100 chunks per batch)
        # 100 chunks * ~100-300 lines is well below the 800k token window of Gemini 3.5 Flash
        batch_size = 100
        batches = [chunks[i:i + batch_size] for i in range(0, len(chunks), batch_size)]
        total_batches = len(batches)

        yield f"data: {json.dumps({'status': 'started', 'total_batches': total_batches})}\n\n"

        all_issues = []

        system_prompt = (
            "You are a senior software engineer performing a code review.\n"
            "Analyze the following code chunks from a real codebase and identify:\n"
            "1. Bugs or potential runtime errors\n"
            "2. Security vulnerabilities (SQL injection, hardcoded secrets, unsafe deserialization, etc.)\n"
            "3. Anti-patterns or poor practices (God classes, deep nesting, missing error handling, etc.)\n"
            "4. Performance issues (N+1 queries, unnecessary loops, memory leaks)\n"
            "5. Missing or inadequate test coverage signals\n\n"
            "For each issue found, respond with a JSON array of objects with this exact structure:\n"
            "[\n"
            "  {\n"
            "    \"severity\": \"critical\" | \"warning\" | \"info\",\n"
            "    \"category\": \"bug\" | \"security\" | \"anti-pattern\" | \"performance\" | \"testing\",\n"
            "    \"file_path\": \"exact/file/path.py\",\n"
            "    \"start_line\": N,\n"
            "    \"end_line\": N,\n"
            "    \"title\": \"Short title of the issue\",\n"
            "    \"description\": \"Detailed explanation of the problem\",\n"
            "    \"suggestion\": \"How to fix it\"\n"
            "  }\n"
            "]\n"
            "Return ONLY the JSON array, no other text."
        )

        for idx, batch in enumerate(batches):
            # Compile chunks details as prompt text
            chunks_str = ""
            for chunk_file_path, chunk_start_line, chunk_end_line, chunk_content, chunk_language in batch:
                chunks_str += (
                    f"File: {chunk_file_path}\n"
                    f"Lines: {chunk_start_line} to {chunk_end_line}\n"
                    f"Language: {chunk_language}\n"
                    f"Content:\n{chunk_content}\n"
                    f"---------------------\n"
                )

            prompt = (
                f"Review the following code chunks from batch {idx + 1} of {total_batches}:\n\n"
                f"{chunks_str}\n"
            )

            batch_issues = []
            try:
                import asyncio
                loop = asyncio.get_event_loop()

                def call_gemini():
                    return client.models.generate_content(
                        model=model,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system_prompt,
                            temperature=0.2,
                            response_mime_type="application/json"
                        )
                    )

                response = await loop.run_in_executor(None, call_gemini)

                if response.text:
                    parsed_issues = json.loads(response.text.strip())
                    if isinstance(parsed_issues, list):
                        batch_issues = parsed_issues
                    elif isinstance(parsed_issues, dict) and "issues" in parsed_issues:
                        batch_issues = parsed_issues["issues"]
            except Exception as ex:
                logger.error(f"Error reviewing batch {idx + 1}: {ex}")
                yield f"data: {json.dumps({'status': 'error', 'message': f'Error in batch {idx+1}: {str(ex)}'})}\n\n"

            # Parse and validate returned issues
            valid_batch_issues = []
            for issue in batch_issues:
                sanitized_issue = {
                    "severity": issue.get("severity", "warning").lower(),
                    "category": issue.get("category", "anti-pattern").lower(),
                    "file_path": issue.get("file_path", "unknown"),
                    "start_line": int(issue.get("start_line", 1)),
                    "end_line": int(issue.get("end_line", 1)),
                    "title": issue.get("title", "Issue found"),
                    "description": issue.get("description", ""),
                    "suggestion": issue.get("suggestion", "")
                }
                # Enforce valid severities
                if sanitized_issue["severity"] not in ("critical", "warning", "info"):
                    sanitized_issue["severity"] = "warning"
                # Enforce valid categories
                if sanitized_issue["category"] not in ("bug", "security", "anti-pattern", "performance", "testing"):
                    sanitized_issue["category"] = "anti-pattern"

                valid_batch_issues.append(sanitized_issue)
                all_issues.append(sanitized_issue)

            yield f"data: {json.dumps({'status': 'processing', 'batch_index': idx + 1, 'issues': valid_batch_issues})}\n\n"

        # Deduplicate issues by filepath, start line, and title
        seen = set()
        deduped_issues = []
        for issue in all_issues:
            key = (issue["file_path"], issue["start_line"], issue["title"])
            if key not in seen:
                seen.add(key)
                deduped_issues.append(issue)

        # Sort issues: critical first, then warning, then info
        severity_rank = {"critical": 0, "warning": 1, "info": 2}
        deduped_issues.sort(key=lambda x: severity_rank.get(x["severity"], 1))

        yield f"data: {json.dumps({'status': 'completed', 'total_issues': len(deduped_issues), 'issues': deduped_issues})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
