"""
Binance REST & WebSocket service for fetching OHLCV data.
Uses native aiohttp for REST and websockets for streaming.
"""

import asyncio
import json
import logging
from typing import Callable, Dict, List, Optional, Any

import aiohttp
import websockets
from websockets.exceptions import ConnectionClosed

from app.core.config import settings
import time
import asyncio

logger = logging.getLogger(__name__)

_GLOBAL_CACHE: Dict[str, dict] = {}
_CACHE_LOCK = asyncio.Lock()

def _get_cached(key: str, ttl: float) -> Optional[Any]:
    if key in _GLOBAL_CACHE:
        entry = _GLOBAL_CACHE[key]
        if time.time() - entry['time'] < ttl:
            data = entry['data']
            # Return a shallow copy if it's a list to prevent mutation bugs
            return data.copy() if isinstance(data, list) else data
    return None

def _set_cached(key: str, data: Any):
    _GLOBAL_CACHE[key] = {'time': time.time(), 'data': data}


class BinanceService:
    """Handles all Binance API interactions (read-only)."""

    def __init__(self):
        self._ws_connections: Dict[str, Any] = {}
        self._running = False
        self._session: Optional[aiohttp.ClientSession] = None
        self._reconnect_delays: Dict[str, float] = {}

    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create an aiohttp session."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def close(self):
        """Clean up all connections."""
        self._running = False
        for symbol, ws in self._ws_connections.items():
            try:
                await ws.close()
            except Exception:
                pass
        self._ws_connections.clear()
        if self._session and not self._session.closed:
            await self._session.close()

    # ──────────────────────────────────────────────
    # REST API
    # ──────────────────────────────────────────────

    async def fetch_klines(
        self,
        symbol: str,
        interval: str = "15m",
        limit: int = 500,
    ) -> List[dict]:
        """
        Fetch historical OHLCV candles from Binance REST API.
        Returns list of candle dicts with keys: open_time, open, high, low, close, volume, close_time.
        """
        cache_key = f"klines_{symbol}_{interval}_{limit}"
        
        async with _CACHE_LOCK:
            cached = _get_cached(cache_key, 5.0)
            if cached is not None:
                return cached

        session = await self._get_session()
        url = f"{settings.BINANCE_REST_URL}/api/v3/klines"
        params = {
            "symbol": symbol.upper(),
            "interval": interval,
            "limit": limit,
        }

        try:
            async with session.get(url, params=params) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    logger.error(f"Binance REST error [{resp.status}]: {error_text}")
                    return []

                raw = await resp.json()
                candles = []
                for k in raw:
                    candles.append({
                        "open_time": int(k[0]),
                        "open": float(k[1]),
                        "high": float(k[2]),
                        "low": float(k[3]),
                        "close": float(k[4]),
                        "volume": float(k[5]),
                        "close_time": int(k[6]),
                        "taker_buy_volume": float(k[9]),
                    })
                logger.info(f"Fetched {len(candles)} klines for {symbol} ({interval})")
                async with _CACHE_LOCK:
                    _set_cached(cache_key, candles)
                return candles

        except Exception as e:
            logger.error(f"Error fetching klines for {symbol}: {e}")
            return []

    async def fetch_ticker_price(self, symbol: str) -> Optional[float]:
        """Fetch current price for a symbol."""
        session = await self._get_session()
        url = f"{settings.BINANCE_REST_URL}/api/v3/ticker/price"
        params = {"symbol": symbol.upper()}

        try:
            async with session.get(url, params=params) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return float(data["price"])
        except Exception as e:
            logger.error(f"Error fetching ticker for {symbol}: {e}")
        return None

    async def fetch_24h_ticker(self, symbol: str) -> Optional[dict]:
        """Fetch 24h price change statistics."""
        session = await self._get_session()
        url = f"{settings.BINANCE_REST_URL}/api/v3/ticker/24hr"
        params = {"symbol": symbol.upper()}

        try:
            async with session.get(url, params=params) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return {
                        "price": float(data["lastPrice"]),
                        "change_24h": float(data["priceChangePercent"]),
                    }
        except Exception as e:
            logger.error(f"Error fetching 24h ticker for {symbol}: {e}")
        return None

    async def fetch_all_24h_tickers(self) -> List[dict]:
        """
        Fetch 24h ticker statistics for ALL symbols from Binance.
        Returns list of dicts with: symbol, price, change_24h, volume_usd, high, low.
        """
        cache_key = "all_tickers"
        
        async with _CACHE_LOCK:
            cached = _get_cached(cache_key, 10.0)
            if cached is not None:
                return cached

        session = await self._get_session()
        url = f"{settings.BINANCE_REST_URL}/api/v3/ticker/24hr"

        try:
            async with session.get(url) as resp:
                if resp.status != 200:
                    logger.error(f"Binance bulk ticker error [{resp.status}]")
                    return []

                raw = await resp.json()
                result = []
                for t in raw:
                    sym = t.get("symbol", "")
                    # Only include USDT pairs, exclude leveraged/down tokens
                    if not sym.endswith("USDT"):
                        continue
                    base = sym.replace("USDT", "")
                    if any(x in base for x in ["UP", "DOWN", "BULL", "BEAR"]):
                        continue
                    try:
                        price = float(t["lastPrice"])
                        change = float(t["priceChangePercent"])
                        vol_usd = float(t["quoteVolume"])  # USDT volume
                        high = float(t["highPrice"])
                        low = float(t["lowPrice"])
                        if price <= 0 or vol_usd <= 0:
                            continue
                        result.append({
                            "symbol": sym,
                            "price": price,
                            "change_24h": change,
                            "volume_usd": vol_usd,
                            "high_24h": high,
                            "low_24h": low,
                        })
                    except (ValueError, KeyError):
                        continue

                logger.info(f"Fetched {len(result)} USDT tickers from Binance")
                async with _CACHE_LOCK:
                    _set_cached(cache_key, result)
                return result
        except Exception as e:
            logger.error(f"Error fetching all 24h tickers: {e}")
            return []

    async def fetch_buy_pressure_scan(self, limit: int = 20) -> List[dict]:
        """
        Scan top volume coins and rank them by taker buy pressure in the last 1 hour.
        """
        tickers = await self.fetch_all_24h_tickers()
        # Sort by volume and get top 100 for scanning
        tickers.sort(key=lambda x: x["volume_usd"], reverse=True)
        top_100 = tickers[:100]

        results = []
        tasks = []
        # We need a bound on concurrency so we don't spam binance API too hard
        sem = asyncio.Semaphore(10)
        
        async def fetch_and_calc(t):
            async with sem:
                candles = await self.fetch_klines(t["symbol"], "1h", limit=1)
                if candles and len(candles) > 0:
                    c = candles[0]
                    if c["volume"] > 0:
                        buy_pct = (c["taker_buy_volume"] / c["volume"]) * 100
                        return {
                            "symbol": t["symbol"],
                            "price": t["price"],
                            "change_24h": t["change_24h"],
                            "volume_usd": t["volume_usd"],
                            "buy_pressure_pct": round(buy_pct, 2)
                        }
                return None

        tasks = [fetch_and_calc(t) for t in top_100]
        results_raw = await asyncio.gather(*tasks, return_exceptions=True)
        
        for res in results_raw:
            if isinstance(res, dict):
                results.append(res)
                
        # Sort by buy pressure descending
        results.sort(key=lambda x: x["buy_pressure_pct"], reverse=True)
        return results[:limit]

    # ──────────────────────────────────────────────
    # WebSocket Streaming
    # ──────────────────────────────────────────────

    async def stream_klines(
        self,
        symbol: str,
        interval: str,
        callback: Callable,
    ):
        """
        Connect to Binance kline WebSocket stream with auto-reconnect.
        Calls `callback(candle_data)` on each kline message.
        """
        stream_key = f"{symbol.lower()}@kline_{interval}"
        url = f"{settings.BINANCE_WS_URL}/{stream_key}"
        self._running = True
        self._reconnect_delays[stream_key] = 1.0

        while self._running:
            try:
                logger.info(f"Connecting to Binance WS: {stream_key}")
                async with websockets.connect(url, ping_interval=20) as ws:
                    self._ws_connections[stream_key] = ws
                    self._reconnect_delays[stream_key] = 1.0  # Reset on success
                    logger.info(f"Connected to Binance WS: {stream_key}")

                    async for message in ws:
                        if not self._running:
                            break
                        try:
                            data = json.loads(message)
                            kline = data.get("k", {})
                            candle = {
                                "open_time": int(kline["t"]),
                                "open": float(kline["o"]),
                                "high": float(kline["h"]),
                                "low": float(kline["l"]),
                                "close": float(kline["c"]),
                                "volume": float(kline["v"]),
                                "close_time": int(kline["T"]),
                                "taker_buy_volume": float(kline.get("V", 0)),
                                "is_closed": kline["x"],  # True when candle is final
                            }
                            await callback(symbol, candle)
                        except (KeyError, ValueError) as e:
                            logger.warning(f"Error parsing kline message: {e}")

            except ConnectionClosed as e:
                logger.warning(f"Binance WS closed for {stream_key}: {e}")
            except Exception as e:
                logger.error(f"Binance WS error for {stream_key}: {e}")

            if self._running:
                delay = self._reconnect_delays.get(stream_key, 1.0)
                logger.info(f"Reconnecting {stream_key} in {delay}s...")
                await asyncio.sleep(delay)
                # Exponential backoff, max 60s
                self._reconnect_delays[stream_key] = min(delay * 2, 60.0)

    async def stream_agg_trades(self, symbol: str, callback: callable):
        """
        Connect to Binance WebSocket and stream live aggTrades.
        Calls `callback(trade_data)` on each aggTrade message.
        """
        stream_key = f"{symbol.lower()}@aggTrade"
        url = f"{settings.BINANCE_WS_URL}/{stream_key}"
        self._running = True
        self._reconnect_delays[stream_key] = 1.0

        while self._running:
            try:
                logger.info(f"Connecting to Binance WS: {stream_key}")
                async with websockets.connect(url, ping_interval=20) as ws:
                    self._ws_connections[stream_key] = ws
                    self._reconnect_delays[stream_key] = 1.0  # Reset on success
                    logger.info(f"Connected to Binance WS: {stream_key}")

                    async for message in ws:
                        if not self._running:
                            break
                        try:
                            data = json.loads(message)
                            trade = {
                                "price": float(data.get("p", 0)),
                                "quantity": float(data.get("q", 0)),
                                "time": int(data.get("T", 0)),
                                "is_buyer_maker": bool(data.get("m", False)), # True = Sell (Taker sold to Maker), False = Buy
                            }
                            await callback(symbol, trade)
                        except (KeyError, ValueError) as e:
                            logger.warning(f"Error parsing trade message: {e}")

            except ConnectionClosed as e:
                logger.warning(f"Binance WS closed for {stream_key}: {e}")
            except Exception as e:
                logger.error(f"Binance WS error for {stream_key}: {e}")

            if self._running:
                delay = self._reconnect_delays.get(stream_key, 1.0)
                logger.info(f"Reconnecting {stream_key} in {delay}s...")
                await asyncio.sleep(delay)
                # Exponential backoff, max 60s
                self._reconnect_delays[stream_key] = min(delay * 2, 60.0)


# Singleton instance
binance_service = BinanceService()
