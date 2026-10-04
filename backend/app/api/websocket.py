"""
WebSocket proxy — streams live market data + signals from backend to frontend.
"""

import asyncio
import json
import logging
import time
from typing import Dict, List, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.core.config import settings
from app.services.binance_service import binance_service, TTL_KLINES_MTF
from app.services.indicator_service import indicator_service
from app.services.signal_service import signal_service
from app.models.candle import MarketUpdate, CandleSchema

logger = logging.getLogger(__name__)
router = APIRouter()

# Stop Binance streams this many seconds after the last client leaves
IDLE_STREAM_GRACE = 60
# Hard cap on concurrent kline streams (protects against WS connection limits)
MAX_KLINE_STREAMS = 30


class ConnectionManager:
    """Manages WebSocket connections per symbol_interval."""

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        self._candle_cache: Dict[str, List[dict]] = {}
        self._mtf_cache: Dict[str, dict] = {}
        self._stream_tasks: Dict[str, asyncio.Task] = {}
        self._trade_tasks: Dict[str, asyncio.Task] = {}

    async def connect(self, websocket: WebSocket, symbol: str, interval: str):
        """Accept a new WebSocket connection and register it."""
        await websocket.accept()
        key = f"{symbol}_{interval}"
        if key not in self.active_connections:
            self.active_connections[key] = set()
        self.active_connections[key].add(websocket)
        logger.info(f"Client connected for {key}. Total: {len(self.active_connections[key])}")

        # Start Binance streams if not already running for this symbol_interval
        if key not in self._stream_tasks or self._stream_tasks[key].done():
            running = sum(1 for t in self._stream_tasks.values() if not t.done())
            if running >= MAX_KLINE_STREAMS:
                self._stop_idle_streams_now()
                running = sum(1 for t in self._stream_tasks.values() if not t.done())
            if running < MAX_KLINE_STREAMS:
                self._stream_tasks[key] = asyncio.create_task(
                    self._start_binance_stream(symbol, interval)
                )
            else:
                logger.warning(f"Kline stream cap reached ({MAX_KLINE_STREAMS}); {key} served from cache only")
        
        # Start Binance aggTrade stream if not already running for this symbol
        if symbol not in self._trade_tasks or self._trade_tasks[symbol].done():
            self._trade_tasks[symbol] = asyncio.create_task(
                binance_service.stream_agg_trades(
                    symbol=symbol,
                    callback=self._on_trade_update
                )
            )

    def disconnect(self, websocket: WebSocket, symbol: str, interval: str):
        """Remove a WebSocket connection and schedule idle stream cleanup."""
        key = f"{symbol}_{interval}"
        if key in self.active_connections:
            self.active_connections[key].discard(websocket)
            logger.info(f"Client disconnected from {key}. Remaining: {len(self.active_connections[key])}")
            if not self.active_connections[key]:
                try:
                    asyncio.get_running_loop().create_task(self._stop_if_idle(symbol, interval))
                except RuntimeError:
                    pass

    def _symbol_has_clients(self, symbol: str) -> bool:
        return any(
            clients for k, clients in self.active_connections.items()
            if k.startswith(f"{symbol}_")
        )

    def _stop_stream(self, symbol: str, interval: str):
        key = f"{symbol}_{interval}"
        task = self._stream_tasks.pop(key, None)
        if task and not task.done():
            task.cancel()
            logger.info(f"Stopped idle kline stream {key}")
        self._candle_cache.pop(key, None)
        self.active_connections.pop(key, None)

        if not self._symbol_has_clients(symbol):
            trade_task = self._trade_tasks.pop(symbol, None)
            if trade_task and not trade_task.done():
                trade_task.cancel()
                logger.info(f"Stopped idle aggTrade stream {symbol}")
            self._mtf_cache.pop(symbol, None)

    async def _stop_if_idle(self, symbol: str, interval: str):
        await asyncio.sleep(IDLE_STREAM_GRACE)
        key = f"{symbol}_{interval}"
        if not self.active_connections.get(key):
            self._stop_stream(symbol, interval)

    def _stop_idle_streams_now(self):
        for key in list(self._stream_tasks.keys()):
            if not self.active_connections.get(key):
                symbol, interval = key.rsplit("_", 1)
                self._stop_stream(symbol, interval)

    async def broadcast(self, symbol: str, interval: str, message: str):
        """Broadcast message to all connected clients for a symbol_interval."""
        key = f"{symbol}_{interval}"
        if key not in self.active_connections:
            return
        disconnected = set()
        for ws in self.active_connections[key]:
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.add(ws)
        for ws in disconnected:
            self.active_connections[key].discard(ws)

    async def broadcast_to_symbol(self, symbol: str, message: str):
        """Broadcast message to all connected clients for a symbol (across all intervals)."""
        disconnected = set()
        for key, clients in self.active_connections.items():
            if key.startswith(f"{symbol}_"):
                for ws in clients:
                    try:
                        await ws.send_text(message)
                    except Exception:
                        disconnected.add((key, ws))
        for key, ws in disconnected:
            self.active_connections[key].discard(ws)

    async def _start_binance_stream(self, symbol: str, interval: str):
        """Start streaming klines from Binance for a symbol_interval."""
        key = f"{symbol}_{interval}"
        logger.info(f"Starting Binance stream for {key}")

        # Fetch initial history
        candles = await binance_service.fetch_klines(symbol, interval, limit=500)
        self._candle_cache[key] = candles

        # Also fetch multi-timeframe data
        mtf_data = {}
        for tf in ["1h", "4h"]:
            tf_candles = await binance_service.fetch_klines(symbol, tf, limit=200, ttl=TTL_KLINES_MTF)
            if tf_candles:
                tf_df = indicator_service.build_dataframe(tf_candles)
                mtf_data[tf] = tf_df

        self._mtf_cache[symbol] = mtf_data

        # Compute initial signal and broadcast
        if candles:
            await self._compute_and_broadcast(symbol, interval, mtf_data)

        # Stream live updates
        await binance_service.stream_klines(
            symbol=symbol,
            interval=interval,
            callback=lambda sym, candle: self._on_kline_update(sym, interval, candle, mtf_data),
        )

    async def _on_trade_update(self, symbol: str, trade: dict):
        """Handle incoming aggTrade update from Binance and broadcast it."""
        try:
            # Broadcast normal trade update
            await self.broadcast_to_symbol(
                symbol,
                json.dumps({
                    "type": "trade_update",
                    "trade": trade,
                })
            )

        except Exception as e:
            logger.error(f"Error broadcasting trade update for {symbol}: {e}")

    async def _on_kline_update(self, symbol: str, interval: str, candle: dict, mtf_data: dict):
        """Handle incoming kline update from Binance."""
        key = f"{symbol}_{interval}"
        if key not in self._candle_cache:
            self._candle_cache[key] = []

        cache = self._candle_cache[key]

        # Update or append candle
        if cache and cache[-1]["open_time"] == candle["open_time"]:
            # Update current candle
            cache[-1] = candle
        else:
            # New candle
            cache.append(candle)
            # Keep cache bounded
            if len(cache) > 600:
                self._candle_cache[key] = cache[-500:]

        # Recompute and broadcast
        await self._compute_and_broadcast(symbol, interval, mtf_data, candle)

    async def _compute_and_broadcast(
        self,
        symbol: str,
        interval: str,
        mtf_data: dict,
        latest_candle: dict = None,
    ):
        """Compute indicators + signal and broadcast to all connected clients."""
        key = f"{symbol}_{interval}"
        cache = self._candle_cache.get(key, [])
        if not cache:
            return

        try:
            # Build DataFrame and compute indicators
            df = indicator_service.build_dataframe(cache)
            df = indicator_service.compute_indicators(df)

            # Calculate signal
            signal = signal_service.calculate_score(
                df, symbol, mtf_data if mtf_data else None
            )

            # Build candle for frontend
            candle_data = None
            if latest_candle:
                candle_data = CandleSchema(
                    time=latest_candle["open_time"] // 1000,
                    open=latest_candle["open"],
                    high=latest_candle["high"],
                    low=latest_candle["low"],
                    close=latest_candle["close"],
                    volume=latest_candle["volume"],
                    taker_buy_volume=latest_candle.get("taker_buy_volume", 0),
                )

            update = MarketUpdate(
                type="market_update",
                signal=signal,
                candle=candle_data,
            )

            await self.broadcast(symbol, interval, update.model_dump_json())

        except Exception as e:
            logger.error(f"Error computing signal for {key}: {e}", exc_info=True)

    async def send_initial_data(self, websocket: WebSocket, symbol: str, interval: str):
        """Send cached history + current signal on initial connection."""
        key = f"{symbol}_{interval}"
        cache = self._candle_cache.get(key, [])

        # If no cache, fetch fresh data
        if not cache:
            candles = await binance_service.fetch_klines(
                symbol, interval, limit=500
            )
            self._candle_cache[key] = candles
            cache = candles

        if not cache:
            return

        # Send candle history
        history = []
        for c in cache:
            history.append({
                "time": c["open_time"] // 1000,
                "open": c["open"],
                "high": c["high"],
                "low": c["low"],
                "close": c["close"],
                "volume": c["volume"],
                "taker_buy_volume": c.get("taker_buy_volume", 0),
            })

        await websocket.send_text(json.dumps({
            "type": "history",
            "candles": history,
        }))

        # Send current signal
        df = indicator_service.build_dataframe(cache)
        df = indicator_service.compute_indicators(df)
        mtf_data = self._mtf_cache.get(symbol)
        if not mtf_data:
            mtf_data = {}
            for tf in ["1h", "4h"]:
                tf_candles = await binance_service.fetch_klines(symbol, tf, limit=200, ttl=TTL_KLINES_MTF)
                if tf_candles:
                    tf_df = indicator_service.build_dataframe(tf_candles)
                    mtf_data[tf] = tf_df
            self._mtf_cache[symbol] = mtf_data

        signal = signal_service.calculate_score(df, symbol, mtf_data if mtf_data else None)

        await websocket.send_text(json.dumps({
            "type": "signal",
            "signal": signal.model_dump(),
        }))


# Global connection manager
manager = ConnectionManager()


@router.websocket("/ws/market/{symbol}")
async def market_websocket(
    websocket: WebSocket,
    symbol: str,
    interval: str = Query(default="15m"),
):
    """
    WebSocket endpoint for live market data streaming.
    Sends: initial history + signal, then continuous updates.
    """
    symbol = symbol.upper()
    await manager.connect(websocket, symbol, interval)

    try:
        # Send initial cached data
        await manager.send_initial_data(websocket, symbol, interval)

        # Keep connection alive — listen for client messages (ping/pong, close)
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=settings.WS_HEARTBEAT_INTERVAL,
                )
                # Handle client ping
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Send heartbeat
                try:
                    await websocket.send_text(json.dumps({"type": "heartbeat", "ts": int(time.time())}))
                except Exception:
                    break

    except WebSocketDisconnect:
        logger.info(f"Client disconnected from {symbol}_{interval}")
    except Exception as e:
        logger.error(f"WebSocket error for {symbol}_{interval}: {e}")
    finally:
        manager.disconnect(websocket, symbol, interval)
