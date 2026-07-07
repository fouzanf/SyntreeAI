from fastapi import APIRouter, HTTPException, status
import logging
from app.models.schemas import IngestRequest, IngestResponse
from app.services.repo_cloner import RepoCloner
from app.services.chunker import Chunker
from app.services.embeddings import EmbeddingService
from app.services.vector_store import VectorStore

router = APIRouter()
logger = logging.getLogger(__name__)

async def run_ingestion(github_url: str) -> IngestResponse:
    vector_store = VectorStore()
    
    # 1. Initialize repo tracking in database
    repo = await vector_store.get_or_create_repo(github_url)
    
    cloner = RepoCloner(github_url)
    try:
        # 2. Clone repo to temporary folder
        cloner.clone()
        
        # 3. Retrieve eligible code files
        source_files = cloner.get_source_files()
        if not source_files:
            await vector_store.update_repo_status(repo.id, "failed")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Repository does not contain any supported source code files (.py, .js, .ts, .tsx, .jsx).",
            )

        # 4. AST-aware chunking
        all_chunks = []
        for file_path, content in source_files:
            chunks = Chunker.chunk_file(file_path, content)
            all_chunks.extend(chunks)

        if not all_chunks:
            await vector_store.update_repo_status(repo.id, "failed")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No parseable code blocks or chunks could be extracted.",
            )

        logger.info(f"Extracted {len(all_chunks)} chunks from {len(source_files)} files.")

        # 5. Generate text-embedding-004 vectors
        embedding_service = EmbeddingService()
        chunk_embeddings = embedding_service.embed_chunks(all_chunks)

        # 6. Bulk insert chunks and update repo status
        await vector_store.insert_chunks(repo.id, chunk_embeddings)
        await vector_store.update_repo_status(repo.id, "completed")

        return IngestResponse(
            repo_id=repo.id,
            status="completed",
            chunk_count=len(all_chunks),
        )

    except Exception as e:
        logger.error(f"Ingestion failed for {github_url}: {e}")
        await vector_store.update_repo_status(repo.id, "failed")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion failed: {str(e)}",
        )
    finally:
        # Ensure temporary clone folder is always cleaned up
        cloner.cleanup()

@router.post("/ingest", response_model=IngestResponse)
async def ingest_repository(request: IngestRequest):
    return await run_ingestion(request.github_url)
