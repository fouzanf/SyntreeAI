import logging
import time
import asyncio
from typing import List, Tuple
from google import genai
from google.genai import types
from app.config import settings
from app.services.chunker import CodeChunk
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

logger = logging.getLogger(__name__)

def is_rate_limit_error(exception) -> bool:
    """Helper to detect 429 rate limit, 503 unavailable, RESOURCE_EXHAUSTED or UNAVAILABLE exceptions."""
    error_msg = str(exception)
    return any(term in error_msg for term in ["429", "503", "UNAVAILABLE", "RESOURCE_EXHAUSTED"])

def custom_wait(retry_state) -> float:
    """Custom wait strategy: wait_exponential(1, 10, 60) for 503/UNAVAILABLE, else wait_exponential(1, 65, 120)."""
    if retry_state.outcome and retry_state.outcome.failed:
        exc = retry_state.outcome.exception()
        exc_str = str(exc)
        if "503" in exc_str or "UNAVAILABLE" in exc_str:
            return wait_exponential(multiplier=1, min=10, max=60)(retry_state=retry_state)
    return wait_exponential(multiplier=1, min=65, max=120)(retry_state=retry_state)

def log_retry(retry_state):
    """Logging callback for tenacity retry attempts."""
    logger.warning(
        f"Gemini API rate limit hit. Attempt {retry_state.attempt_number} failed. "
        f"Retrying in {retry_state.next_action.sleep:.2f}s... Error: {retry_state.outcome.exception()}"
    )

def get_active_github_url_sync() -> str:
    """
    Retrieves the github_url of the repository currently being ingested.
    Since we cannot easily change other files, querying the most recent
    pending or ingesting repository from the database is a robust way to
    check if a limit parameter was passed.
    """
    from sqlalchemy import text
    from app.services.vector_store import engine
    
    async def _query():
        async with engine.connect() as conn:
            stmt = text("SELECT github_url FROM repos WHERE status = 'ingesting' ORDER BY created_at DESC LIMIT 1;")
            res = await conn.execute(stmt)
            row = res.first()
            return row[0] if row else ""
            
    try:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
            
        if loop and loop.is_running():
            import threading
            result_container = []
            evt = threading.Event()
            
            def run_in_new_loop():
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                try:
                    res_val = new_loop.run_until_complete(_query())
                    result_container.append(res_val)
                except Exception:
                    result_container.append("")
                finally:
                    new_loop.close()
                evt.set()
                
            t = threading.Thread(target=run_in_new_loop)
            t.start()
            evt.wait()
            return result_container[0] if result_container else ""
        else:
            return asyncio.run(_query())
    except Exception as e:
        logger.warning(f"Could not check active github_url: {e}")
    return ""

class EmbeddingService:
    def __init__(self):
        # Initialize Google GenAI client with key from settings
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = "gemini-embedding-2"

    @retry(
        retry=retry_if_exception(is_rate_limit_error),
        wait=custom_wait,
        stop=stop_after_attempt(3),
        before_sleep=log_retry,
        reraise=True
    )
    def _embed_content_api(self, contents_input, config):
        """Wraps the Gemini embedding call with rate limit retries."""
        return self.client.models.embed_content(
            model=self.model,
            contents=contents_input,
            config=config
        )

    def embed_chunks(self, chunks: List[CodeChunk], batch_size: int = 80) -> List[Tuple[CodeChunk, List[float]]]:
        """
        Generates embeddings for a list of CodeChunks in batches.
        Enforces rate limiting constraints (max 80 per batch, 65s pause).
        Returns a list of tuples: (CodeChunk, embedding_vector)
        """
        results = []
        if not chunks:
            return results

        # 1. Small-repo test mode check (?limit=50 in the URL query parameters)
        github_url = get_active_github_url_sync()
        if "limit=50" in github_url:
            logger.info("Small-repo test mode (?limit=50) detected. Truncating chunks in-place to first 50.")
            del chunks[50:]

        # 2. Filter out empty, None, or whitespace-only chunks defensively
        valid_chunks: List[CodeChunk] = []
        skipped_count = 0
        for chunk in chunks:
            if chunk.content is None:
                skipped_count += 1
                continue
            stripped = chunk.content.strip()
            if not stripped:
                skipped_count += 1
            else:
                valid_chunks.append(chunk)

        if skipped_count > 0:
            logger.warning(
                f"Defensive filter: skipped {skipped_count} empty or whitespace-only chunks before calling Gemini API."
            )

        if not valid_chunks:
            return results

        total_chunks = len(valid_chunks)
        # Process in batches of 80 to stay safely under free tier 100/min limits
        batch_size = 80
        total_batches = (total_chunks + batch_size - 1) // batch_size

        # 3. Process batches sequentially
        for i in range(0, total_chunks, batch_size):
            batch = valid_chunks[i : i + batch_size]
            batch_num = i // batch_size + 1
            
            # Map strings to explicit types.Content objects
            contents_input = [
                types.Content(parts=[types.Part.from_text(text=chunk.content)])
                for chunk in batch
            ]
            
            success = False
            embeddings = []
            
            try:
                logger.info(f"Generating embeddings for batch {batch_num}/{total_batches} ({len(batch)} chunks)...")
                response = self._embed_content_api(
                    contents_input=contents_input,
                    config=types.EmbedContentConfig(output_dimensionality=768)
                )
                embeddings = response.embeddings
                success = True
            except Exception as e:
                logger.error(f"Failed to generate embeddings for batch {batch_num} after all retry attempts: {e}")
                raise e
            
            if not success or len(embeddings) != len(batch):
                raise ValueError(f"Expected {len(batch)} embeddings for batch {batch_num}, but received {len(embeddings)}.")

            for chunk, emb in zip(batch, embeddings):
                results.append((chunk, emb.values))

            # Pause for 65s between batches to cleanly clear the rate-limit window
            if batch_num < total_batches:
                logger.info(
                    f"Embedded batch {batch_num}/{total_batches} ({len(batch)} chunks). "
                    f"Rate limit pause: waiting 65s before next batch..."
                )
                time.sleep(65)

        return results

    def embed_text(self, text: str) -> List[float]:
        """Generates embedding for a single text string (used for query search)."""
        try:
            response = self._embed_content_api(
                contents_input=text,
                config=types.EmbedContentConfig(output_dimensionality=768)
            )
            return response.embeddings[0].values
        except Exception as e:
            logger.error(f"Failed to embed query: {e}")
            raise e
