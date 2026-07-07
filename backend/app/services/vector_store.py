import datetime
import logging
from typing import List, Tuple, Any
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, text, ARRAY, select, delete
from pgvector.sqlalchemy import Vector
from app.config import settings

logger = logging.getLogger(__name__)

# Enforce asyncpg dialect for SQLAlchemy async operations and sanitize query params
from urllib.parse import urlparse, parse_qs, urlunparse, urlencode

db_url = settings.database_url
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# asyncpg does not support sslmode or channel_binding as query parameters.
# Extract them and map to connect_args.
parsed = urlparse(db_url)
query_params = parse_qs(parsed.query)
sslmode = query_params.pop("sslmode", [None])[0]
query_params.pop("channel_binding", None)

new_query = urlencode(query_params, doseq=True)
parsed = parsed._replace(query=new_query)
db_url = urlunparse(parsed)

connect_args = {}
if sslmode in ("require", "verify-ca", "verify-full") or "sslmode" in settings.database_url:
    connect_args["ssl"] = True

from sqlalchemy.pool import NullPool
engine = create_async_engine(db_url, echo=False, connect_args=connect_args, poolclass=NullPool)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
Base = declarative_base()

class Repo(Base):
    __tablename__ = "repos"

    id = Column(Integer, primary_key=True, index=True)
    github_url = Column(String, nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    status = Column(String, default="pending")  # pending, ingesting, completed, failed
    type = Column(String, default="repo")  # repo or pr_review
    diff_summary = Column(Text, nullable=True)

    chunks = relationship("Chunk", back_populates="repo", cascade="all, delete-orphan")

class Chunk(Base):
    __tablename__ = "chunks"

    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("repos.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String, nullable=False)
    start_line = Column(Integer, nullable=False)
    end_line = Column(Integer, nullable=False)
    language = Column(String, nullable=False)
    kind = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    imports = Column(ARRAY(String), nullable=False, default=[])
    
    # 768 dimensions for Gemini text-embedding-004
    embedding = Column(Vector(768), nullable=False)

    repo = relationship("Repo", back_populates="chunks")

async def init_db():
    """Startup initialization: creates vector extension and tables."""
    async with engine.begin() as conn:
        logger.info("Initializing database: creating pgvector extension and schema...")
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        await conn.run_sync(Base.metadata.create_all)
        # Execute migration to add columns if they do not exist
        await conn.execute(text("ALTER TABLE repos ADD COLUMN IF NOT EXISTS type VARCHAR DEFAULT 'repo';"))
        await conn.execute(text("ALTER TABLE repos ADD COLUMN IF NOT EXISTS diff_summary TEXT;"))
        logger.info("Database schema initialized successfully.")

class VectorStore:
    async def get_or_create_repo(self, github_url: str, repo_type: str = "repo") -> Repo:
        """Fetch repo if it exists, otherwise create a new pending record."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Repo).where(Repo.github_url == github_url))
            repo = result.scalars().first()
            if repo:
                repo.status = "ingesting"
                repo.type = repo_type
                await session.commit()
                await session.refresh(repo)
                return repo

            repo = Repo(github_url=github_url, status="ingesting", type=repo_type)
            session.add(repo)
            await session.commit()
            await session.refresh(repo)
            return repo

    async def update_repo_status(self, repo_id: int, status: str):
        """Update the ingestion state of a repository."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Repo).where(Repo.id == repo_id))
            repo = result.scalars().first()
            if repo:
                repo.status = status
                await session.commit()

    async def insert_chunks(self, repo_id: int, chunk_embeddings: List[Tuple[Any, List[float]]]):
        """Clear previous chunks for the repo, then bulk insert new chunks."""
        async with AsyncSessionLocal() as session:
            # Delete old chunks to allow clean re-ingestion
            await session.execute(delete(Chunk).where(Chunk.repo_id == repo_id))
            
            for code_chunk, emb in chunk_embeddings:
                chunk_record = Chunk(
                    repo_id=repo_id,
                    file_path=code_chunk.file_path,
                    start_line=code_chunk.start_line,
                    end_line=code_chunk.end_line,
                    language=code_chunk.language,
                    kind=code_chunk.kind,
                    content=code_chunk.content,
                    imports=code_chunk.imports,
                    embedding=emb,
                )
                session.add(chunk_record)
            
            await session.commit()
            logger.info(f"Successfully stored {len(chunk_embeddings)} chunks for repo_id {repo_id}.")

    async def search_similar_chunks(self, repo_id: int, query_embedding: List[float], top_k: int = 5) -> List[Chunk]:
        """Perform cosine similarity search using pgvector's <=> distance operator."""
        async with AsyncSessionLocal() as session:
            stmt = (
                select(Chunk)
                .where(Chunk.repo_id == repo_id)
                .order_by(Chunk.embedding.cosine_distance(query_embedding))
                .limit(top_k)
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())
