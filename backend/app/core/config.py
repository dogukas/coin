"""
Application configuration loaded from environment variables.
"""

from pydantic_settings import BaseSettings
from typing import List
import os
from dotenv import load_dotenv

# Load .env file from backend root
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))


class Settings(BaseSettings):
    """Application settings with environment variable support."""

    # Binance API (optional for public market data)
    BINANCE_API_KEY: str = ""
    BINANCE_API_SECRET: str = ""

    # Binance endpoints
    BINANCE_REST_URL: str = "https://data-api.binance.vision"
    BINANCE_WS_URL: str = "wss://data-stream.binance.vision/ws"

    # Self-imposed REST weight budget per minute (Binance hard limit: 6000/IP).
    # Kept low because Render outbound IPs are shared with other tenants.
    BINANCE_WEIGHT_BUDGET: int = 1200

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./candles.db"

    # Default trading pairs
    DEFAULT_SYMBOLS: str = "BTCUSDT,ETHUSDT,SOLUSDT"

    # Default candle interval
    DEFAULT_INTERVAL: str = "15m"

    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # WebSocket settings
    WS_HEARTBEAT_INTERVAL: int = 30  # seconds

    @property
    def symbols_list(self) -> List[str]:
        """Parse comma-separated symbols into a list."""
        return [s.strip() for s in self.DEFAULT_SYMBOLS.split(",") if s.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = True


# Singleton settings instance
settings = Settings()
