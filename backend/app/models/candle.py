"""
SQLAlchemy models and Pydantic schemas for candle/signal data.
"""

from sqlalchemy import Column, Integer, Float, String, BigInteger, UniqueConstraint
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from app.core.database import Base


# ──────────────────────────────────────────────
# SQLAlchemy ORM Model
# ──────────────────────────────────────────────

class CandleModel(Base):
    """Cached OHLCV candle data from Binance."""

    __tablename__ = "candles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), nullable=False, index=True)
    interval = Column(String(10), nullable=False)
    open_time = Column(BigInteger, nullable=False, index=True)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, nullable=False)
    close_time = Column(BigInteger, nullable=False)

    __table_args__ = (
        UniqueConstraint("symbol", "interval", "open_time", name="uq_candle"),
    )

    def to_dict(self) -> dict:
        return {
            "time": self.open_time // 1000,  # Convert ms to seconds for lightweight-charts
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
        }


# ──────────────────────────────────────────────
# Pydantic Schemas
# ──────────────────────────────────────────────

class CandleSchema(BaseModel):
    """Single OHLCV candle for API responses."""
    time: int  # Unix timestamp in seconds
    open: float
    high: float
    low: float
    close: float
    volume: float
    taker_buy_volume: Optional[float] = 0.0
    taker_sell_volume: Optional[float] = 0.0


class IndicatorData(BaseModel):
    """Computed technical indicator values."""
    rsi: Optional[float] = None
    macd_line: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_histogram: Optional[float] = None
    macd_trend: Optional[str] = None  # "bullish" or "bearish"
    ema_20: Optional[float] = None
    ema_50: Optional[float] = None
    ema_200: Optional[float] = None
    ema_trend: Optional[str] = None  # "bullish_cross", "bearish_cross", "neutral"
    bb_upper: Optional[float] = None
    bb_middle: Optional[float] = None
    bb_lower: Optional[float] = None
    vwap: Optional[float] = None
    volume_ma: Optional[float] = None
    current_volume: Optional[float] = None
    buy_pressure_pct: Optional[float] = None  # % of volume that is taker buy


class SignalPayload(BaseModel):
    """Complete signal payload sent to frontend via WebSocket."""
    symbol: str
    price: float
    score: int  # 0–100
    label: str  # SAT / ZAYIF, BEKLE / NÖTR, AL SİNYALİ, GÜÇLÜ AL SİNYALİ
    indicators: IndicatorData
    reasons: List[str]
    timestamp: int  # Unix timestamp


class MarketUpdate(BaseModel):
    """Full market update payload for WebSocket broadcast."""
    type: str = "market_update"
    signal: SignalPayload
    candle: Optional[CandleSchema] = None


class SymbolInfo(BaseModel):
    """Symbol information for the watchlist."""
    symbol: str
    price: Optional[float] = None
    change_24h: Optional[float] = None


class MarketCoin(BaseModel):
    """Extended coin data for the market browser."""
    symbol: str
    price: float
    change_24h: float
    volume_usd: float
    high_24h: Optional[float] = None
    low_24h: Optional[float] = None
    category: Optional[str] = None  # "popular", "gainer", "loser", "new"


class MarketOverview(BaseModel):
    """Categorized market overview response."""
    popular: List[MarketCoin]
    gainers: List[MarketCoin]
    losers: List[MarketCoin]
    total_count: int

class TACubeData(BaseModel):
    symbol: str
    price: float
    change_24h: float
    volume_usd: float
    signal_score: float
    signal_level: str
    rsi_14: Optional[float]
    macd_value: Optional[float]
    macd_trend: Optional[str]
    buy_pressure_pct: float
    sparkline: List[float] = []
