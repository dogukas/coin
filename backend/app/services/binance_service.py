"""
Binance REST & WebSocket service for fetching OHLCV data.
Uses native aiohttp for REST and websockets for streaming.

BAN PROTECTION (layers, in order):
  1. All-market tickers come from ONE WebSocket stream (`!miniTicker@arr`) -> 0 REST weight.
  2. Every REST result is cached; concurrent identical requests are merged (lock).
  3. Local weight budget: we never spend more than BINANCE_WEIGHT_BUDGET / minute.
  4. Server weight sync: if Binance reports high usage for our IP (shared Render IP!),
     REST pauses until the next minute window.
  5. Circuit breaker: on 418 / 429 / 451 we stop ALL REST calls until the ban ends
     (requests during a ban extend it).
  6. Stale-cache fallback: while paused, the last good data is served.
  7. WebSocket connect attempts are globally rate-limited with jittered backoff.
"""

import asyncio
import json
import logging
import random
import re
import time
from collections import deque
from typing import Any, Awaitable, Callable, Deque, Dict, List, Optional, Tuple

import aiohttp
import websockets
from websockets.exceptions import ConnectionClosed

from app.core.config import settings

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════
# Cache
# ══════════════════════════════════════════════

_GLOBAL_CACHE: Dict[str, dict] = {}
_LOCKS: Dict[str, asyncio.Lock] = {}

# Cache TTLs (seconds)
TTL_KLINES = 5.0
TTL_KLINES_MTF = 300.0               # 1h / 4h context candles for scoring
TTL_KLINES_SCAN = 60.0               # 1h candle used by buy-pressure scan
TTL_ALL_TICKERS_REST = 30.0          # REST fallback only (weight 80!)
TTL_BUY_PRESSURE = 60.0
TTL_TICKER = 5.0


def _get_cached(key: str, ttl: float) -> Optional[Any]:
    entry = _GLOBAL_CACHE.get(key)
    if entry is not None and time.time() - entry['time'] < ttl:
        data = entry['data']
        # Return a shallow copy if it's a list to prevent mutation bugs
        return data.copy() if isinstance(data, list) else data
    return None


def _get_stale(key: str) -> Optional[Any]:
    """Return cached data regardless of age (used as fallback while paused)."""
    entry = _GLOBAL_CACHE.get(key)
    if entry is None:
        return None
    data = entry['data']
    return data.copy() if isinstance(data, list) else data


def _set_cached(key: str, data: Any):
    _GLOBAL_CACHE[key] = {'time': time.time(), 'data': data}


def _lock(key: str) -> asyncio.Lock:
    if key not in _LOCKS:
        _LOCKS[key] = asyncio.Lock()
    return _LOCKS[key]


async def get_or_compute(key: str, ttl: float, factory: Callable[[], Awaitable[Any]]) -> Any:
    """
    Shared result cache for whole endpoints.
    - Fresh cache -> returned immediately (no Binance call, no matter how many users).
    - Concurrent misses are merged into a single computation.
    - Empty / failed result -> last good (stale) result is served instead.
    """
    cached = _get_cached(key, ttl)
    if cached is not None:
        return cached

    async with _lock(key):
        cached = _get_cached(key, ttl)
        if cached is not None:
            return cached

        result = None
        try:
            result = await factory()
        except Exception as e:
            logger.error(f"get_or_compute({key}) failed: {e}")

        if result is not None and (result or not is_banned()):
            _set_cached(key, result)
            return result.copy() if isinstance(result, list) else result

        stale = _get_stale(key)
        if stale is not None:
            return stale
        return result if result is not None else []


# ══════════════════════════════════════════════
# Bybit Fallback API (For Shared IP Bans)
# ══════════════════════════════════════════════

async def _fetch_bybit_klines(session: aiohttp.ClientSession, symbol: str, interval: str, limit: int) -> Optional[List[dict]]:
    """Fetch klines from Bybit as a fallback when Binance IP is banned."""
    imap = {
        "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
        "1h": "60", "2h": "120", "4h": "240", "6h": "360", "12h": "720",
        "1d": "D", "1w": "W", "1M": "M"
    }
    b_interval = imap.get(interval, "15")
    url = "https://api.bybit.com/v5/market/kline"
    params = {
        "category": "spot",
        "symbol": symbol.upper(),
        "interval": b_interval,
        "limit": limit
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        async with session.get(url, params=params, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status == 200:
                data = await resp.json()
                if data.get("retCode") == 0 and "list" in data.get("result", {}):
                    raw_list = data["result"]["list"]
                    # Bybit returns descending (newest first), Binance is ascending (oldest first)
                    raw_list.reverse()
                    
                    candles = []
                    for k in raw_list:
                        candles.append({
                            "open_time": int(k[0]),
                            "open": float(k[1]),
                            "high": float(k[2]),
                            "low": float(k[3]),
                            "close": float(k[4]),
                            "volume": float(k[5]),
                            "close_time": int(k[0]), # Bybit doesn't have exact close time, use open
                            "taker_buy_volume": float(k[5]) / 2, # Approximation since missing
                        })
                    return candles
            else:
                text = await resp.text()
                logger.error(f"Bybit fallback failed [{resp.status}]: {text[:200]}")
    except Exception as e:
        logger.error(f"Bybit fallback exception for {symbol}: {e}")
    return None

async def _fetch_mexc_klines(session: aiohttp.ClientSession, symbol: str, interval: str, limit: int) -> Optional[List[dict]]:
    """Fetch klines from MEXC as a final fallback (No US IP blocks, no shared IP rate limits)."""
    imap = {
        "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
        "1h": "60m", "2h": "2h", "4h": "4h", "6h": "6h", "12h": "12h",
        "1d": "1d", "1w": "1W", "1M": "1M"
    }
    m_interval = imap.get(interval, "15m")
    url = "https://api.mexc.com/api/v3/klines"
    params = {
        "symbol": symbol.upper(),
        "interval": m_interval,
        "limit": limit
    }
    try:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status == 200:
                raw_list = await resp.json()
                candles = []
                for k in raw_list:
                    open_p = float(k[1])
                    close_p = float(k[4])
                    vol = float(k[5])
                    
                    # Approximate taker buy volume based on candle direction
                    if close_p > open_p:
                        taker_buy = vol * 0.55
                    elif close_p < open_p:
                        taker_buy = vol * 0.45
                    else:
                        taker_buy = vol * 0.50
                        
                    candles.append({
                        "open_time": int(k[0]),
                        "open": open_p,
                        "high": float(k[2]),
                        "low": float(k[3]),
                        "close": close_p,
                        "volume": vol,
                        "close_time": int(k[6]),
                        "taker_buy_volume": taker_buy,
                    })
                return candles
            else:
                text = await resp.text()
                logger.error(f"MEXC fallback failed [{resp.status}]: {text[:200]}")
    except Exception as e:
        logger.error(f"MEXC fallback exception for {symbol}: {e}")
    return None

async def _fetch_mexc_all_24h_tickers_rest(session: aiohttp.ClientSession) -> Optional[List[dict]]:
    """Fetch all 24h tickers from MEXC as fallback (US IP friendly)."""
    url = "https://api.mexc.com/api/v3/ticker/24hr"
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status == 200:
                raw_list = await resp.json()
                result = []
                for t in raw_list:
                    try:
                        pct = float(t.get("priceChangePercent", 0)) * 100
                        t["priceChangePercent"] = str(pct)
                        result.append(t)
                    except:
                        pass
                return result
    except Exception as e:
        logger.error(f"MEXC 24h tickers fallback exception: {e}")
    return None

# ══════════════════════════════════════════════
# Rate-limit / ban protection
# ══════════════════════════════════════════════

_BANNED_UNTIL: float = 0.0           # unix seconds; REST is paused until then
_SERVER_WEIGHT_SOFT_LIMIT = 3000     # Binance limit is 6000/min per IP
_WEIGHT_LOG: Deque[Tuple[float, int]] = deque()
_last_budget_warn = 0.0

# Binance: max 300 WS connection attempts / 5 min / IP -> we allow 150
_WS_CONNECT_LOG: Deque[float] = deque()
_WS_CONNECT_LIMIT = 150
_WS_CONNECT_WINDOW = 300.0


def is_banned() -> bool:
    return time.time() < _BANNED_UNTIL


def ban_remaining_seconds() -> int:
    return max(0, int(_BANNED_UNTIL - time.time()))


def _pause_rest(until: float, reason: str):
    global _BANNED_UNTIL
    if until > _BANNED_UNTIL:
        _BANNED_UNTIL = until
        logger.error(f"⛔ Binance REST paused for {ban_remaining_seconds()}s – {reason}")


def _local_weight_used() -> int:
    cutoff = time.time() - 60
    while _WEIGHT_LOG and _WEIGHT_LOG[0][0] < cutoff:
        _WEIGHT_LOG.popleft()
    return sum(w for _, w in _WEIGHT_LOG)


def _estimate_weight(path: str, params: Optional[dict]) -> int:
    """Request weights as documented by Binance (spot API v3)."""
    params = params or {}
    if path == "/api/v3/klines":
        limit = int(params.get("limit", 500))
        if limit < 100:
            return 2
        if limit < 500:
            return 2
        if limit <= 1000:
            return 5
        return 10
    if path == "/api/v3/ticker/24hr":
        return 2 if "symbol" in params else 80
    if path == "/api/v3/ticker/price":
        return 2 if "symbol" in params else 4
    return 10


def _reserve_weight(weight: int) -> bool:
    """Reserve weight from the local per-minute budget. False = over budget."""
    global _last_budget_warn
    if _local_weight_used() + weight > settings.BINANCE_WEIGHT_BUDGET:
        now = time.time()
        if now - _last_budget_warn > 10:
            _last_budget_warn = now
            logger.warning(
                f"Local weight budget reached ({_local_weight_used()}/"
                f"{settings.BINANCE_WEIGHT_BUDGET}/min) – serving cached data"
            )
        return False
    _WEIGHT_LOG.append((time.time(), weight))
    return True


async def _ws_connect_guard():
    """Wait until we are allowed another WebSocket connection attempt."""
    while True:
        if is_banned():
            await asyncio.sleep(min(ban_remaining_seconds() + 1, 60))
            continue
        now = time.time()
        while _WS_CONNECT_LOG and _WS_CONNECT_LOG[0] < now - _WS_CONNECT_WINDOW:
            _WS_CONNECT_LOG.popleft()
        if len(_WS_CONNECT_LOG) < _WS_CONNECT_LIMIT:
            _WS_CONNECT_LOG.append(now)
            return
        wait = _WS_CONNECT_LOG[0] + _WS_CONNECT_WINDOW - now + 1
        logger.warning(f"WS connect limit reached – waiting {int(wait)}s")
        await asyncio.sleep(max(wait, 1))


# ══════════════════════════════════════════════
# Live ticker store (filled by !miniTicker@arr WebSocket)
# ══════════════════════════════════════════════

_TICKERS: Dict[str, dict] = {}
_TICKERS_LAST_MSG: float = 0.0
_EXCLUDED_TOKENS = ("UP", "DOWN", "BULL", "BEAR")


def _is_valid_usdt_symbol(sym: str) -> bool:
    if not sym.endswith("USDT"):
        return False
    base = sym[:-4]
    return not any(x in base for x in _EXCLUDED_TOKENS)


def _ticker_store_healthy() -> bool:
    return len(_TICKERS) >= 1 and time.time() - _TICKERS_LAST_MSG < 30


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
        for symbol, ws in list(self._ws_connections.items()):
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

    async def _rest_get(self, path: str, params: Optional[dict] = None) -> Optional[Any]:
        """
        Central REST GET – the ONLY place that talks to Binance REST.
        Returns parsed JSON, or None on failure / while paused / over budget.
        """
        if is_banned():
            return None
        if not _reserve_weight(_estimate_weight(path, params)):
            return None

        session = await self._get_session()
        url = f"{settings.BINANCE_REST_URL}{path}"
        try:
            async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                # Sync with the real IP usage reported by Binance (shared IP aware)
                used = resp.headers.get("X-MBX-USED-WEIGHT-1M")
                if used and used.isdigit() and int(used) > _SERVER_WEIGHT_SOFT_LIMIT:
                    now = time.time()
                    _pause_rest(now + (60 - now % 60) + 2, f"server weight {used}/6000")

                if resp.status in (418, 429):
                    text = await resp.text()
                    until = time.time() + 120  # default 2 min
                    m = re.search(r"banned until (\d+)", text)
                    if m:
                        until = int(m.group(1)) / 1000.0 + 5
                    else:
                        retry_after = resp.headers.get("Retry-After")
                        if retry_after and retry_after.isdigit():
                            until = time.time() + int(retry_after) + 1
                    _pause_rest(until, f"HTTP {resp.status}: {text[:150]}")
                    return None

                if resp.status in (403, 451):
                    # 451 = restricted location (e.g. US region), 403 = WAF
                    text = await resp.text()
                    _pause_rest(time.time() + 600, f"HTTP {resp.status} (region/WAF): {text[:150]}")
                    return None

                if resp.status != 200:
                    text = await resp.text()
                    logger.error(f"Binance REST error [{resp.status}] {path}: {text[:200]}")
                    return None

                return await resp.json()
        except Exception as e:
            logger.error(f"Binance REST exception {path}: {e}")
            return None

    async def fetch_klines(
        self,
        symbol: str,
        interval: str = "15m",
        limit: int = 500,
        ttl: float = TTL_KLINES,
    ) -> List[dict]:
        """
        Fetch historical OHLCV candles from Binance REST API.
        Returns list of candle dicts with keys: open_time, open, high, low, close, volume, close_time.
        """
        symbol = symbol.upper()
        cache_key = f"klines_{symbol}_{interval}_{limit}"
        cached = _get_cached(cache_key, ttl)
        if cached is not None:
            return cached

        async with _lock(cache_key):
            # Another coroutine may have filled the cache while we waited
            cached = _get_cached(cache_key, ttl)
            if cached is not None:
                return cached

            raw = await self._rest_get(
                "/api/v3/klines",
                {"symbol": symbol, "interval": interval, "limit": limit},
            )

            candles = []
            if raw is not None:
                try:
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
                except Exception as e:
                    logger.error(f"Error parsing klines for {symbol}: {e}")
            
            if not candles:
                # ── BYBIT FALLBACK ──
                session = await self._get_session()
                bybit_candles = await _fetch_bybit_klines(session, symbol, interval, limit)
                if bybit_candles:
                    candles = bybit_candles
                    logger.info(f"Loaded {len(candles)} klines for {symbol} ({interval}) from BYBIT (Fallback)")
                else:
                    # ── MEXC FALLBACK ──
                    mexc_candles = await _fetch_mexc_klines(session, symbol, interval, limit)
                    if mexc_candles:
                        candles = mexc_candles
                        logger.info(f"Loaded {len(candles)} klines for {symbol} ({interval}) from MEXC (Fallback)")

            if candles:
                _set_cached(cache_key, candles)
                return candles
                
            return _get_stale(cache_key) or []

    async def fetch_ticker_price(self, symbol: str) -> Optional[float]:
        """Fetch current price for a symbol (live store first, REST fallback)."""
        symbol = symbol.upper()
        live = _TICKERS.get(symbol)
        if live and time.time() - live["ts"] < 60:
            return live["price"]

        cache_key = f"price_{symbol}"
        cached = _get_cached(cache_key, TTL_TICKER)
        if cached is not None:
            return cached

        data = await self._rest_get("/api/v3/ticker/price", {"symbol": symbol})
        if data is None:
            return _get_stale(cache_key)
        try:
            price = float(data["price"])
            _set_cached(cache_key, price)
            return price
        except Exception as e:
            logger.error(f"Error parsing ticker for {symbol}: {e}")
            return _get_stale(cache_key)

    async def fetch_24h_ticker(self, symbol: str) -> Optional[dict]:
        """Fetch 24h price change statistics (live store first, REST fallback)."""
        symbol = symbol.upper()
        live = _TICKERS.get(symbol)
        if live and time.time() - live["ts"] < 60:
            return {"price": live["price"], "change_24h": live["change_24h"]}

        cache_key = f"t24_{symbol}"
        cached = _get_cached(cache_key, TTL_TICKER)
        if cached is not None:
            return cached

        data = await self._rest_get("/api/v3/ticker/24hr", {"symbol": symbol})
        if data is None:
            return _get_stale(cache_key)
        try:
            result = {
                "price": float(data["lastPrice"]),
                "change_24h": float(data["priceChangePercent"]),
            }
            _set_cached(cache_key, result)
            return result
        except Exception as e:
            logger.error(f"Error parsing 24h ticker for {symbol}: {e}")
            return _get_stale(cache_key)

    async def fetch_all_24h_tickers(self) -> List[dict]:
        """
        24h ticker statistics for ALL USDT symbols.
        Served from the live WebSocket store (0 weight). REST (weight 80) is only
        used as a cached fallback when the stream is not healthy yet.
        Returns list of dicts with: symbol, price, change_24h, volume_usd, high_24h, low_24h.
        """
        if _ticker_store_healthy():
            return [
                {
                    "symbol": t["symbol"],
                    "price": t["price"],
                    "change_24h": t["change_24h"],
                    "volume_usd": t["volume_usd"],
                    "high_24h": t["high_24h"],
                    "low_24h": t["low_24h"],
                }
                for t in _TICKERS.values()
                if t["price"] > 0 and t["volume_usd"] > 0
            ]
        return await self._fetch_all_24h_tickers_rest()

    async def _fetch_all_24h_tickers_rest(self) -> List[dict]:
        cache_key = "all_tickers"
        cached = _get_cached(cache_key, TTL_ALL_TICKERS_REST)
        if cached is not None:
            return cached

        async with _lock(cache_key):
            cached = _get_cached(cache_key, TTL_ALL_TICKERS_REST)
            if cached is not None:
                return cached

            raw = await self._rest_get("/api/v3/ticker/24hr")
            if raw is None:
                # ── MEXC FALLBACK ──
                session = await self._get_session()
                raw = await _fetch_mexc_all_24h_tickers_rest(session)
                if raw is None:
                    return _get_stale(cache_key) or []
                logger.info("Using MEXC fallback for all 24h tickers")

            try:
                result = []
                now = time.time()
                for t in raw:
                    sym = t.get("symbol", "")
                    # Only include USDT pairs, exclude leveraged/down tokens
                    if not _is_valid_usdt_symbol(sym):
                        continue
                    try:
                        price = float(t["lastPrice"])
                        change = float(t["priceChangePercent"])
                        vol_usd = float(t["quoteVolume"])  # USDT volume
                        high = float(t["highPrice"])
                        low = float(t["lowPrice"])
                        if price <= 0 or vol_usd <= 0:
                            continue
                        item = {
                            "symbol": sym,
                            "price": price,
                            "change_24h": change,
                            "volume_usd": vol_usd,
                            "high_24h": high,
                            "low_24h": low,
                        }
                        result.append(item)
                        # Seed the live store (WS updates will override)
                        if sym not in _TICKERS:
                            _TICKERS[sym] = {**item, "ts": now}
                    except (ValueError, KeyError):
                        continue

                logger.info(f"Fetched {len(result)} USDT tickers from Binance REST")
                _set_cached(cache_key, result)
                return result
            except Exception as e:
                logger.error(f"Error parsing all 24h tickers: {e}")
                return _get_stale(cache_key) or []

    async def fetch_buy_pressure_scan(self, limit: int = 20) -> List[dict]:
        """
        Scan top volume coins and rank them by taker buy pressure in the last 1 hour.
        Whole result is cached (TTL_BUY_PRESSURE) – shared by all users.
        """
        async def compute():
            return await self._scan_buy_pressure()

        results = await get_or_compute("buy_pressure_scan", TTL_BUY_PRESSURE, compute)
        return results[:limit]

    async def _scan_buy_pressure(self) -> List[dict]:
        tickers = await self.fetch_all_24h_tickers()
        # Sort by volume and get top 50 for scanning
        tickers.sort(key=lambda x: x["volume_usd"], reverse=True)
        top_n = tickers[:50]

        results = []
        # We need a bound on concurrency so we don't spam binance API too hard
        sem = asyncio.Semaphore(5)

        async def fetch_and_calc(t):
            async with sem:
                if is_banned():
                    return None
                candles = await self.fetch_klines(t["symbol"], "1h", limit=1, ttl=TTL_KLINES_SCAN)
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

        tasks = [fetch_and_calc(t) for t in top_n]
        results_raw = await asyncio.gather(*tasks, return_exceptions=True)

        for res in results_raw:
            if isinstance(res, dict):
                results.append(res)

        # Sort by buy pressure descending
        results.sort(key=lambda x: x["buy_pressure_pct"], reverse=True)
        return results

    # ──────────────────────────────────────────────
    # WebSocket Streaming
    # ──────────────────────────────────────────────

    def _next_delay(self, stream_key: str) -> float:
        delay = self._reconnect_delays.get(stream_key, 1.0)
        # Exponential backoff with jitter, max 60s
        self._reconnect_delays[stream_key] = min(delay * 2, 60.0)
        return delay * random.uniform(0.8, 1.3)

    async def run_ticker_stream(self):
        """
        Background task: keeps the live all-market ticker store up to date
        via `!miniTicker@arr` (1 connection, 0 REST weight).
        """
        global _TICKERS_LAST_MSG
        stream_key = "!miniTicker@arr"
        url = f"{settings.BINANCE_WS_URL}/{stream_key}"
        self._reconnect_delays[stream_key] = 1.0

        while True:
            try:
                await _ws_connect_guard()
                logger.info("Connecting to Binance all-market ticker stream")
                async with websockets.connect(url, ping_interval=20, max_size=2 ** 23) as ws:
                    self._reconnect_delays[stream_key] = 1.0
                    async for message in ws:
                        try:
                            data = json.loads(message)
                        except ValueError:
                            continue
                        if not isinstance(data, list):
                            continue
                        now = time.time()
                        for t in data:
                            sym = t.get("s", "")
                            if not _is_valid_usdt_symbol(sym):
                                continue
                            try:
                                close = float(t["c"])
                                open_ = float(t["o"])
                                _TICKERS[sym] = {
                                    "symbol": sym,
                                    "price": close,
                                    "change_24h": round((close - open_) / open_ * 100, 3) if open_ > 0 else 0.0,
                                    "volume_usd": float(t["q"]),
                                    "high_24h": float(t["h"]),
                                    "low_24h": float(t["l"]),
                                    "ts": now,
                                }
                            except (KeyError, ValueError, TypeError):
                                continue
                        _TICKERS_LAST_MSG = now
            except asyncio.CancelledError:
                raise
            except ConnectionClosed as e:
                logger.warning(f"Ticker stream closed: {e}")
            except Exception as e:
                logger.error(f"Ticker stream error: {e}")

            await asyncio.sleep(self._next_delay(stream_key))

    async def stream_klines(
        self,
        symbol: str,
        interval: str,
        callback: Callable,
    ):
        """
        Connect to Binance kline WebSocket stream with auto-reconnect.
        Calls `callback(candle_data)` on each kline message.
        Stop it by cancelling the asyncio task that runs it.
        """
        stream_key = f"{symbol.lower()}@kline_{interval}"
        url = f"{settings.BINANCE_WS_URL}/{stream_key}"
        self._running = True
        self._reconnect_delays[stream_key] = 1.0

        try:
            while self._running:
                try:
                    await _ws_connect_guard()
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

                except asyncio.CancelledError:
                    raise
                except ConnectionClosed as e:
                    logger.warning(f"Binance WS closed for {stream_key}: {e}")
                except Exception as e:
                    logger.error(f"Binance WS error for {stream_key}: {e}")

                if self._running:
                    delay = self._next_delay(stream_key)
                    logger.info(f"Reconnecting {stream_key} in {delay:.1f}s...")
                    await asyncio.sleep(delay)
        finally:
            self._ws_connections.pop(stream_key, None)
            logger.info(f"Stopped Binance WS: {stream_key}")

    async def stream_agg_trades(self, symbol: str, callback: Callable):
        """
        Connect to Binance WebSocket and stream live aggTrades.
        Calls `callback(trade_data)` on each aggTrade message.
        Stop it by cancelling the asyncio task that runs it.
        """
        stream_key = f"{symbol.lower()}@aggTrade"
        url = f"{settings.BINANCE_WS_URL}/{stream_key}"
        self._running = True
        self._reconnect_delays[stream_key] = 1.0

        try:
            while self._running:
                try:
                    await _ws_connect_guard()
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

                except asyncio.CancelledError:
                    raise
                except ConnectionClosed as e:
                    logger.warning(f"Binance WS closed for {stream_key}: {e}")
                except Exception as e:
                    logger.error(f"Binance WS error for {stream_key}: {e}")

                if self._running:
                    delay = self._next_delay(stream_key)
                    logger.info(f"Reconnecting {stream_key} in {delay:.1f}s...")
                    await asyncio.sleep(delay)
        finally:
            self._ws_connections.pop(stream_key, None)
            logger.info(f"Stopped Binance WS: {stream_key}")

    # ──────────────────────────────────────────────
    # Diagnostics
    # ──────────────────────────────────────────────

    def rate_limit_status(self) -> dict:
        return {
            "rest_paused": is_banned(),
            "rest_paused_seconds": ban_remaining_seconds(),
            "local_weight_used_1m": _local_weight_used(),
            "local_weight_budget_1m": settings.BINANCE_WEIGHT_BUDGET,
            "ticker_stream_healthy": _ticker_store_healthy(),
            "ticker_symbols": len(_TICKERS),
            "open_ws_streams": len(self._ws_connections),
        }


# Singleton instance
binance_service = BinanceService()
