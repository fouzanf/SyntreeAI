import logging
from typing import List, Tuple, Dict, Any, Generator, Optional
from google import genai
from google.genai import types
from app.config import settings
from app.services.embeddings import EmbeddingService
from app.services.vector_store import VectorStore
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

def log_query_retry(retry_state):
    """Logging callback for query embedding retries."""
    logger.warning(
        f"Query embedding rate limit hit. Attempt {retry_state.attempt_number} failed. "
        f"Retrying query embedding in {retry_state.next_action.sleep:.2f}s... Error: {retry_state.outcome.exception()}"
    )

class RetrievalService:
    def __init__(self):
        self.embedding_service = EmbeddingService()
        self.vector_store = VectorStore()
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = "gemini-2.5-flash"

    @retry(
        retry=retry_if_exception(is_rate_limit_error),
        wait=custom_wait,
        stop=stop_after_attempt(3),
        before_sleep=log_query_retry,
        reraise=True
    )
    def _embed_query_with_retry(self, question: str) -> List[float]:
        """Generates embedding for query text with rate limit retries."""
        return self.embedding_service.embed_text(question)

    async def retrieve_context(self, repo_id: int, question: str) -> Tuple[List[Dict[str, Any]], str]:
        """
        Embeds the query, runs cosine similarity search against stored chunks,
        pulls imports metadata for cross-file context, and formats the prompt context.
        """
        logger.info(f"Retrieving context for query: {question}")
        
        # 1. Embed query
        query_vector = self._embed_query_with_retry(question)

        # 2. Search database for top-5 chunks
        similar_chunks = await self.vector_store.search_similar_chunks(
            repo_id=repo_id, query_embedding=query_vector, top_k=5
        )

        citations = []
        context_blocks = []

        # 3. Format chunks and include imports metadata
        for i, chunk in enumerate(similar_chunks):
            citation = {
                "id": i + 1,
                "file_path": chunk.file_path,
                "start_line": chunk.start_line,
                "end_line": chunk.end_line,
            }
            citations.append(citation)

            # Format imports list if present
            imports_str = "\n".join(f"  - {imp}" for imp in chunk.imports) if chunk.imports else "  - None"

            block = (
                f"--- CODE BLOCK {i + 1} ---\n"
                f"File: {chunk.file_path}\n"
                f"Lines: {chunk.start_line} to {chunk.end_line}\n"
                f"Language: {chunk.language}\n"
                f"Node Kind: {chunk.kind}\n"
                f"Imports in this file:\n{imports_str}\n\n"
                f"Content:\n{chunk.content}\n"
                f"-------------------------\n"
            )
            context_blocks.append(block)

        context_str = "\n".join(context_blocks)
        return citations, context_str

    def stream_answer(
        self,
        question: str,
        context_str: str,
        messages: Optional[List[dict]] = None
    ) -> Generator[str, None, None]:
        """
        Instructs Gemini 3.5 Flash to answer the question using provided context,
        and streams back response tokens.
        """
        system_prompt = (
            "You are SyntreeAI, a senior AI developer tool that answers questions about codebases.\n"
            "Answering Guidelines:\n"
            "1. Answer the question using ONLY the provided code blocks.\n"
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
            
            total_len = len(context_str) + len(history_text) + len(question)
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
                f"Context from the codebase:\n"
                f"{context_str}\n\n"
                f"Question:\n"
                f"{question}\n\n"
                f"Answer:"
            )
        else:
            prompt = (
                f"Context from the codebase:\n"
                f"{context_str}\n\n"
                f"Question:\n"
                f"{question}\n\n"
                f"Answer:"
            )

        try:
            logger.info("Calling Gemini content generation stream...")
            response = self.client.models.generate_content_stream(
                model=self.model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.2,
                ),
            )
            for chunk in response:
                yield chunk.text
        except Exception as e:
            logger.error(f"Error during Gemini streaming: {e}")
            yield f"\n[Error during content generation: {str(e)}]"
