"""
FastAPI application entry point.
Configures CORS, registers routes, and manages lifecycle events.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.api.endpoints import router as api_router
from app.api.websocket import router as ws_router
from app.services.binance_service import binance_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle — startup and shutdown events."""
    # ── Startup ──
    logger.info("🚀 Starting Crypto Signal Engine...")
    await init_db()
    logger.info(f"📊 Tracking symbols: {settings.symbols_list}")
    logger.info(f"⏱  Default interval: {settings.DEFAULT_INTERVAL}")
    # Live all-market tickers via ONE WebSocket (replaces 80-weight REST calls)
    ticker_task = asyncio.create_task(binance_service.run_ticker_stream())
    logger.info("✅ Backend ready")

    yield

    # ── Shutdown ──
    logger.info("🛑 Shutting down...")
    ticker_task.cancel()
    await binance_service.close()
    logger.info("👋 Goodbye")


# ──────────────────────────────────────────────
# Application
# ──────────────────────────────────────────────

app = FastAPI(
    title="Crypto Signal Engine",
    description="Real-time cryptocurrency analysis and signal generation engine",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(api_router)
app.include_router(ws_router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
        workers=1,  # keep 1: cache & rate limiter are per-process
    )
