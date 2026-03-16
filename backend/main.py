"""Astra — FastAPI entry point."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router
from app.api.voice_routes import voice_router
from app.api.whatsapp_routes import whatsapp_router
from app.api.auth_routes import auth_router
from app.core.database import init_db, close_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown events."""
    init_db()
    yield
    close_db()


app = FastAPI(
    title="Astra",
    description="Agentic Backtesting Engine API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(voice_router)
app.include_router(whatsapp_router)
app.include_router(auth_router)


@app.get("/")
async def root():
    return {"message": "Astra Backend", "docs": "/docs"}
