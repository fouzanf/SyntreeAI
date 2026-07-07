import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import ingest, query, graph, analysis, pr_review
from app.services.vector_store import init_db

# Configure global application logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Execute table creation and verify pgvector extension
    try:
        await init_db()
    except Exception as e:
        logger.critical(f"Failed to initialize database: {e}")
        raise e
    yield

app = FastAPI(
    title="SyntreeAI Backend",
    description="AST-aware Code Retrieval & QA Engine powered by pgvector & Gemini",
    version="1.0.0",
    lifespan=lifespan,
)

# Parse and clean CORS allowed origins list
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(ingest.router, tags=["Ingestion"])
app.include_router(query.router, tags=["Querying"])
app.include_router(graph.router, tags=["Dependency Graph"])
app.include_router(analysis.router, tags=["Code Smell Detector"])
app.include_router(pr_review.router, tags=["PR Review Mode"])

@app.get("/health")
def health_check():
    return {"status": "healthy"}
