import re
import json
import base64
import logging
import queue
import asyncio
import os
from typing import Optional, List
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
import httpx
from google import genai
from google.genai import types

from app.config import settings
from app.services.vector_store import AsyncSessionLocal, Repo, VectorStore
from app.services.chunker import Chunker
from app.services.embeddings import EmbeddingService
from app.services.retrieval import RetrievalService
from app.models.schemas import ChatMessage

router = APIRouter()
logger = logging.getLogger(__name__)

class PRReviewRequest(BaseModel):
    pr_url: str = Field(..., description="The GitHub pull request HTTP(S) URL")
    question: Optional[str] = Field("Is this PR safe to merge?", description="Optional custom review prompt")
    messages: Optional[List[ChatMessage]] = Field(default=None, description="Optional conversation history")

def stream_pr_answer(question: str, context_str: str, diff_summary: str, messages: Optional[List[dict]] = None):
    """
    Calls Gemini to perform PR analysis and yields response tokens.
    """
    system_prompt = (
        "You are reviewing a GitHub Pull Request.\n"
        "The changed files are provided as code chunks. The diff shows what was added (+) and removed (-).\n"
        "Evaluate: correctness, security, performance, breaking changes, and test coverage.\n"
        "Be specific about file paths and line numbers.\n\n"
        "Answering Guidelines:\n"
        "1. Answer the question using ONLY the provided code blocks and diff context.\n"
        "2. When explaining code, refer to the exact file paths and line numbers from the blocks.\n"
        "3. Be precise, highly technical, and correct.\n"
        "4. If the code blocks do not contain the answer, state that clearly."
    )

    # Max context limit check (1M tokens ~= 4M chars)
    max_chars = 1000000 * 4
    history = messages[-6:] if messages else []

    while len(history) > 0:
        history_lines = []
        for msg in history:
            role = "User" if msg.get("role") == "user" else "Assistant"
            content = msg.get("content", "")
            history_lines.append(f"{role}: {content}")
        
        history_text = (
            "Previous conversation:\n" +
            "\n".join(history_lines) +
            "\n\nNow answer this new question using the codebase context AND the conversation history above."
        )
        
        total_len = len(context_str) + len(diff_summary) + len(history_text) + len(question)
        if total_len <= max_chars:
            break
        # Truncate oldest first
        history.pop(0)

    if history:
        history_lines = []
        for msg in history:
            role = "User" if msg.get("role") == "user" else "Assistant"
            content = msg.get("content", "")
            history_lines.append(f"{role}: {content}")
        
        history_text = (
            "Previous conversation:\n" +
            "\n".join(history_lines) +
            "\n\nNow answer this new question using the codebase context AND the conversation history above."
        )

        prompt = (
            f"{history_text}\n\n"
            f"PR Diff Summary:\n"
            f"{diff_summary}\n\n"
            f"Context from the codebase:\n"
            f"{context_str}\n\n"
            f"Question:\n"
            f"{question}\n\n"
            f"Answer:"
        )
    else:
        prompt = (
            f"PR Diff Summary:\n"
            f"{diff_summary}\n\n"
            f"Context from the codebase:\n"
            f"{context_str}\n\n"
            f"Question:\n"
            f"{question}\n\n"
            f"Answer:"
        )

    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content_stream(
            model="gemini-3.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.2,
            ),
        )
        for chunk in response:
            yield chunk.text
    except Exception as e:
        logger.error(f"Error during Gemini PR review generation: {e}")
        yield f"\n[Error during content generation: {str(e)}]"

async def fetch_file_content(client: httpx.AsyncClient, owner: str, repo: str, path: str, ref: str, headers: dict) -> Optional[str]:
    contents_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={ref}"
    try:
        response = await client.get(contents_url, headers=headers)
        if response.status_code == 200:
            res_json = response.json()
            if "content" in res_json:
                content_b64 = res_json["content"].replace("\n", "").strip()
                return base64.b64decode(content_b64).decode("utf-8")
        logger.warning(f"Failed to fetch content for {path}: {response.status_code} {response.text}")
    except Exception as e:
        logger.error(f"Error fetching content for {path}: {e}")
    return None

@router.post("/review-pr")
async def review_pull_request(request: PRReviewRequest):
    pr_url = request.pr_url.strip()
    question = request.question.strip() if request.question else "Is this PR safe to merge?"

    # 1. Parse pull request URL
    # format: https://github.com/owner/repo/pull/123
    pattern = r"github\.com/([a-zA-Z0-9_-]+)/([a-zA-Z0-9_.-]+)/pull/(\d+)"
    match = re.search(pattern, pr_url)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid GitHub Pull Request URL. Must be in the format: https://github.com/owner/repo/pull/num"
        )
    owner, repo_name, pr_number = match.groups()

    # 2. Build headers (supporting GITHUB_TOKEN environment variable)
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "SyntreeAI-App"
    }
    github_token = os.getenv("GITHUB_TOKEN")
    if github_token:
        headers["Authorization"] = f"token {github_token}"

    try:
        async with httpx.AsyncClient() as client:
            # Fetch Pull Request Metadata
            pr_api_url = f"https://api.github.com/repos/{owner}/{repo_name}/pulls/{pr_number}"
            response = await client.get(pr_api_url, headers=headers)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"GitHub API Error fetching PR details: {response.text}"
                )
            pr_data = response.json()
            head_sha = pr_data["head"]["sha"]

            # Fetch Changed Files List
            files_api_url = f"https://api.github.com/repos/{owner}/{repo_name}/pulls/{pr_number}/files"
            response = await client.get(files_api_url, headers=headers)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"GitHub API Error fetching PR files: {response.text}"
                )
            pr_files = response.json()

            # Compile diff summary and fetch full contents for tree-sitter chunking
            diff_parts = []
            all_chunks = []

            for file in pr_files:
                filename = file.get("filename")
                patch = file.get("patch", "")
                file_status = file.get("status")

                if not filename:
                    continue

                diff_parts.append(f"--- File: {filename} ({file_status}) ---\n{patch}\n")

                if file_status == "removed":
                    continue

                # Filter: check if file has a supported code extension to avoid fetching binary files
                ext = filename.split(".")[-1].lower()
                if ext not in ("py", "js", "ts", "tsx", "jsx"):
                    continue

                # Fetch full file contents at head sha commit ref
                content = await fetch_file_content(client, owner, repo_name, filename, head_sha, headers)
                if content:
                    # Run tree-sitter chunker on this file's code content
                    chunks = Chunker.chunk_file(filename, content)
                    all_chunks.extend(chunks)

            if not all_chunks:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This Pull Request does not contain any supported code chunks (.py, .js, .ts, .tsx, .jsx)."
                )

            diff_summary = "\n".join(diff_parts)

            # 3. Create or get database repository record marked as type pr_review
            vector_store = VectorStore()
            db_repo = await vector_store.get_or_create_repo(pr_url, repo_type="pr_review")

            # 4. Generate embeddings and bulk insert chunks
            embedding_service = EmbeddingService()
            chunk_embeddings = embedding_service.embed_chunks(all_chunks)

            await vector_store.insert_chunks(db_repo.id, chunk_embeddings)

            # 5. Store diff summary and complete ingestion state
            async with AsyncSessionLocal() as session:
                repo_record = await session.get(Repo, db_repo.id)
                if repo_record:
                    repo_record.diff_summary = diff_summary
                    repo_record.status = "completed"
                    await session.commit()

            # 6. Retrieve similarity context for Gemini review response
            retrieval_service = RetrievalService()
            citations, context_str = await retrieval_service.retrieve_context(
                repo_id=db_repo.id, question=question
            )

    except Exception as ex:
        logger.error(f"Failed PR Ingestion/Review workflow: {ex}")
        if isinstance(ex, HTTPException):
            raise ex
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PR Review initialization failed: {str(ex)}"
        )

    messages_list = None
    if request.messages is not None:
        messages_list = [{"role": msg.role, "content": msg.content} for msg in request.messages]

    # 7. SSE streaming output (yield repo_id and citations first, then tokens)
    q = queue.Queue()

    def run_inference_thread():
        try:
            for token in stream_pr_answer(question, context_str, diff_summary, messages_list):
                q.put(token)
        except Exception as ex_inf:
            logger.error(f"Error in Gemini inference thread for PR review: {ex_inf}")
            q.put(ex_inf)
        finally:
            q.put(None)

    async def event_generator():
        # First event streams metadata
        yield f"data: {json.dumps({'repo_id': db_repo.id, 'citations': citations})}\n\n"

        # Trigger Gemini thread
        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, run_inference_thread)

        while True:
            while q.empty():
                await asyncio.sleep(0.02)
            
            token = q.get()
            if token is None:
                break
            if isinstance(token, Exception):
                yield f"data: {json.dumps({'error': f'PR Review Generation error: {str(token)}'})}\n\n"
                break
            
            yield f"data: {json.dumps({'token': token})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

def parse_raw_diff(diff_str: Optional[str]) -> list:
    if not diff_str:
        return []
        
    files = []
    current_file = None
    current_chunk = None
    
    current_old_line = 0
    current_new_line = 0
    
    file_header_pat = re.compile(r"^---\s+File:\s+(.*?)\s+\((.*?)\)\s+---")
    chunk_header_pat = re.compile(r"^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@")
    
    lines = diff_str.splitlines()
    for line in lines:
        header_match = file_header_pat.match(line)
        if header_match:
            filename = header_match.group(1).strip()
            status = header_match.group(2).strip()
            current_file = {
                "filename": filename,
                "status": status,
                "additions": 0,
                "deletions": 0,
                "chunks": []
            }
            files.append(current_file)
            current_chunk = None
            continue
            
        if current_file is None:
            continue
            
        chunk_match = chunk_header_pat.match(line)
        if chunk_match:
            old_start = int(chunk_match.group(1))
            new_start = int(chunk_match.group(2))
            current_old_line = old_start
            current_new_line = new_start
            current_chunk = {
                "header": line,
                "old_start": old_start,
                "new_start": new_start,
                "lines": []
            }
            current_file["chunks"].append(current_chunk)
            continue
            
        if current_chunk is None:
            continue
            
        if line.startswith("+"):
            current_chunk["lines"].append({
                "type": "added",
                "old_line_num": None,
                "new_line_num": current_new_line,
                "content": line
            })
            current_new_line += 1
            current_file["additions"] += 1
        elif line.startswith("-"):
            current_chunk["lines"].append({
                "type": "removed",
                "old_line_num": current_old_line,
                "new_line_num": None,
                "content": line
            })
            current_old_line += 1
            current_file["deletions"] += 1
        else:
            content = line[1:] if (line and line[0] == " ") else line
            current_chunk["lines"].append({
                "type": "context",
                "old_line_num": current_old_line,
                "new_line_num": current_new_line,
                "content": content
            })
            current_old_line += 1
            current_new_line += 1
            
    return files

@router.get("/diff/{repo_id}")
async def get_pr_diff(repo_id: int):
    async with AsyncSessionLocal() as session:
        repo_record = await session.get(Repo, repo_id)
        if not repo_record:
            raise HTTPException(status_code=404, detail="Repository not found")
        if not repo_record.diff_summary:
            return JSONResponse(
                status_code=400,
                content={"error": "Diff not available. Please re-ingest this PR."}
            )
            
        parsed_files = parse_raw_diff(repo_record.diff_summary)
        return {
            "pr_url": repo_record.github_url,
            "files": parsed_files
        }

class AnnotateDiffRequest(BaseModel):
    repo_id: int
    filename: str

@router.post("/annotate-diff")
async def annotate_diff(request: AnnotateDiffRequest):
    async with AsyncSessionLocal() as session:
        repo_record = await session.get(Repo, request.repo_id)
        if not repo_record:
            raise HTTPException(status_code=404, detail="Repository not found")
        if not repo_record.diff_summary:
            return JSONResponse(
                status_code=400,
                content={"error": "Diff not available. Please re-ingest this PR."}
            )
            
        parsed_files = parse_raw_diff(repo_record.diff_summary)
        target_file = None
        for f in parsed_files:
            if f["filename"] == request.filename:
                target_file = f
                break
                
        if not target_file:
            raise HTTPException(status_code=404, detail=f"File {request.filename} not found in PR diff")
            
        # Re-construct the file-specific diff to send to Gemini
        file_diff_lines = []
        for chunk in target_file["chunks"]:
            file_diff_lines.append(chunk["header"])
            for l in chunk["lines"]:
                if l["type"] == "added":
                    file_diff_lines.append(l["content"])
                elif l["type"] == "removed":
                    file_diff_lines.append(l["content"])
                else:
                    file_diff_lines.append(" " + l["content"])
        
        file_diff_str = "\n".join(file_diff_lines)
        
        prompt = (
            "You are a senior code reviewer analyzing a git diff.\n"
            "For each changed line (additions and removals), provide "
            "a specific annotation if there is something noteworthy "
            "— a bug, improvement, security issue, style note, or "
            "explanation of why this change matters.\n\n"
            f"Git Diff:\n{file_diff_str}\n\n"
            "Return ONLY a JSON array:\n"
            "[\n"
            "  {\n"
            "    \"line_num\": N,  // the new file line number\n"
            "    \"type\": \"bug\" | \"security\" | \"improvement\" | \"info\" | \"positive\",\n"
            "    \"message\": \"Short annotation max 120 chars\"\n"
            "  }\n"
            "]\n"
            "Only annotate lines that have something meaningful to say.\n"
            "Skip lines where there is nothing notable.\n"
            "Return empty array [] if no annotations needed."
        )
        
        try:
            client = genai.Client(api_key=settings.gemini_api_key)
            response = client.models.generate_content(
                model="gemini-3.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.2,
                )
            )
            annotations = json.loads(response.text.strip())
            return annotations
        except Exception as e:
            logger.error(f"Error during Gemini diff annotation: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate AI annotations: {str(e)}"
            )

