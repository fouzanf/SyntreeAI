import json
import queue
import asyncio
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from app.models.schemas import QueryRequest
from app.services.retrieval import RetrievalService
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/query")
async def query_repository(request: QueryRequest):
    retrieval_service = RetrievalService()
    
    try:
        # Retrieve similarities and build context
        citations, context_str = await retrieval_service.retrieve_context(
            repo_id=request.repo_id, question=request.question
        )
    except Exception as e:
        logger.error(f"Failed to query database context: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Semantic search query failed: {str(e)}",
        )

    # Fetch repository type and diff summary to handle PR reviews
    from app.services.vector_store import AsyncSessionLocal, Repo
    repo_type = "repo"
    diff_summary = None
    try:
        async with AsyncSessionLocal() as session:
            db_repo = await session.get(Repo, request.repo_id)
            if db_repo:
                repo_type = db_repo.type
                diff_summary = db_repo.diff_summary
    except Exception as e:
        logger.error(f"Failed to retrieve repo metadata for repo_id {request.repo_id}: {e}")

    # Bridge between Gemini's synchronous streaming iterator and FastAPI's async SSE generator
    q = queue.Queue()

    messages_list = None
    if request.messages is not None:
        messages_list = [{"role": msg.role, "content": msg.content} for msg in request.messages]

    def run_inference_thread():
        try:
            if repo_type == "pr_review" and diff_summary:
                from app.routers.pr_review import stream_pr_answer
                for token in stream_pr_answer(request.question, context_str, diff_summary, messages_list):
                    q.put(token)
            else:
                for token in retrieval_service.stream_answer(request.question, context_str, messages_list):
                    q.put(token)
        except Exception as ex:
            logger.error(f"Error in Gemini inference thread: {ex}")
            q.put(ex)
        finally:
            q.put(None)  # Sentinel to mark completion

    async def event_generator():
        # 1. Stream the citation blocks first
        yield f"data: {json.dumps({'citations': citations})}\n\n"
        
        # 2. Trigger the Gemini inference thread
        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, run_inference_thread)
        
        # 3. Stream text tokens as they arrive
        while True:
            while q.empty():
                await asyncio.sleep(0.02)  # Yield execution to allow queue to fill
            
            token = q.get()
            if token is None:
                break
            if isinstance(token, Exception):
                yield f"data: {json.dumps({'error': f'Generation error: {str(token)}'})}\n\n"
                break
            
            yield f"data: {json.dumps({'token': token})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
