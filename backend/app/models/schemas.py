from pydantic import BaseModel, HttpUrl, Field
from typing import Optional, List

class ChatMessage(BaseModel):
    role: str
    content: str

class IngestRequest(BaseModel):
    github_url: str = Field(..., description="The GitHub repository HTTP(S) URL to clone and ingest")

class IngestResponse(BaseModel):
    repo_id: int = Field(..., description="Database ID of the ingested repository")
    status: str = Field(..., description="Status of ingestion (e.g. completed, failed)")
    chunk_count: int = Field(..., description="Number of AST chunks successfully processed and stored")

class QueryRequest(BaseModel):
    repo_id: int = Field(..., description="Database ID of the repository to query")
    question: str = Field(..., description="The natural-language question about the repository")
    messages: Optional[List[ChatMessage]] = Field(default=None, description="Optional conversation history")
