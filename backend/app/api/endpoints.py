"""
REST API endpoints — health check, symbol list, candle history, signal snapshot, market overview.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Query

from app.core.config import settings
from app.services.binance_service import binance_service
from app.services.indicator_service import indicator_service
from app.services.signal_service import signal_service
from app.models.candle import CandleSchema, SignalPayload, SymbolInfo, MarketCoin, MarketOverview

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["market"])


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "crypto-signal-engine"}


@router.get("/symbols", response_model=List[SymbolInfo])
async def get_symbols():
    """Return list of supported trading symbols with current prices."""
    symbols = settings.symbols_list
    result = []
    for sym in symbols:
        ticker = await binance_service.fetch_24h_ticker(sym)
        if ticker:
            result.append(SymbolInfo(
                symbol=sym,
                price=ticker["price"],
                change_24h=ticker["change_24h"],
            ))
        else:
            result.append(SymbolInfo(symbol=sym))
    return result


@router.get("/market/overview", response_model=MarketOverview)
async def get_market_overview(
    limit: int = Query(default=20, ge=5, le=50, description="Number of coins per category"),
):
    """
    Return market overview with coins categorized as:
    - popular: highest 24h USDT volume
    - gainers: highest 24h % change
    - losers: lowest 24h % change (biggest drops)
    """
    all_tickers = await binance_service.fetch_all_24h_tickers()
    if not all_tickers:
        return MarketOverview(popular=[], gainers=[], losers=[], total_count=0)

    # Filter out very low volume / dust coins (min $100K daily volume)
    filtered = [t for t in all_tickers if t["volume_usd"] >= 100_000]

    # Popular: sort by volume descending
    by_volume = sorted(filtered, key=lambda x: x["volume_usd"], reverse=True)
    popular = [
        MarketCoin(category="popular", **t) for t in by_volume[:limit]
    ]

    # Gainers: sort by change descending (only positive)
    by_gain = sorted(
        [t for t in filtered if t["change_24h"] > 0],
        key=lambda x: x["change_24h"],
        reverse=True,
    )
    gainers = [
        MarketCoin(category="gainer", **t) for t in by_gain[:limit]
    ]

    # Losers: sort by change ascending (most negative first)
    by_loss = sorted(
        [t for t in filtered if t["change_24h"] < 0],
        key=lambda x: x["change_24h"],
    )
    losers = [
        MarketCoin(category="loser", **t) for t in by_loss[:limit]
    ]

    return MarketOverview(
        popular=popular,
        gainers=gainers,
        losers=losers,
        total_count=len(filtered),
    )


@router.get("/market/search", response_model=List[MarketCoin])
async def search_market(
    q: str = Query(description="Search query (symbol or base name)"),
    limit: int = Query(default=20, ge=1, le=50),
):
    """Search for coins by symbol name."""
    all_tickers = await binance_service.fetch_all_24h_tickers()
    query = q.upper().strip()
    matches = [
        MarketCoin(**t) for t in all_tickers
        if query in t["symbol"] and t["volume_usd"] >= 10_000
    ]
    # Sort matches by volume
    matches.sort(key=lambda x: x.volume_usd, reverse=True)
    return matches[:limit]


@router.get("/market/strong-buys")
async def get_strong_buys(
    limit: int = Query(default=20, ge=1, le=50),
):
    """Scan market for highest buy pressure in the last hour."""
    results = await binance_service.fetch_buy_pressure_scan(limit=limit)
    return results


@router.get("/history/{symbol}", response_model=List[CandleSchema])
async def get_history(
    symbol: str,
    interval: str = Query(default="15m", description="Candle interval"),
    limit: int = Query(default=500, ge=1, le=1000, description="Number of candles"),
):
    """Fetch historical OHLCV candles for a symbol."""
    raw_candles = await binance_service.fetch_klines(
        symbol=symbol.upper(),
        interval=interval,
        limit=limit,
    )

    candles = []
    for c in raw_candles:
        candles.append(CandleSchema(
            time=c["open_time"] // 1000,  # ms → seconds
            open=c["open"],
            high=c["high"],
            low=c["low"],
            close=c["close"],
            volume=c["volume"],
            taker_buy_volume=c.get("taker_buy_volume", 0),
        ))
    return candles


@router.get("/signal/{symbol}", response_model=SignalPayload)
async def get_signal(
    symbol: str,
    interval: str = Query(default="15m", description="Primary interval"),
):
    """
    REST fallback: compute and return the latest signal for a symbol.
    Fetches fresh klines, computes indicators, and scores.
    """
    symbol = symbol.upper()

    # Fetch primary timeframe candles
    candles = await binance_service.fetch_klines(symbol, interval, limit=500)
    if not candles:
        return signal_service._empty_signal(symbol)

    df = indicator_service.build_dataframe(candles)
    df = indicator_service.compute_indicators(df)

    # Fetch multi-timeframe data for scoring
    mtf_data = {}
    for tf in ["1h", "4h"]:
        tf_candles = await binance_service.fetch_klines(symbol, tf, limit=200)
        if tf_candles:
            tf_df = indicator_service.build_dataframe(tf_candles)
            mtf_data[tf] = tf_df

    signal = signal_service.calculate_score(df, symbol, mtf_data if mtf_data else None)
    return signal

from app.models.candle import TACubeData
import asyncio

@router.get("/market/ta-cubes", response_model=List[TACubeData])
async def get_ta_cubes(limit: int = Query(default=24, ge=1, le=50)):
    """Fetch TA and Signal data for top coins as 'Cubes'."""
    tickers = await binance_service.fetch_all_24h_tickers()
    
    # Sort by volume and get top
    tickers.sort(key=lambda x: x["volume_usd"], reverse=True)
    top_coins = tickers[:limit]
    
    results = []
    sem = asyncio.Semaphore(5)
    
    async def process_coin(t):
        symbol = t["symbol"]
        price = t["price"]
        change_24h = t["change_24h"]
        volume_usd = t["volume_usd"]
        
        async with sem:
            # 1. Fetch 15m candles
            candles = await binance_service.fetch_klines(symbol, "15m", limit=200)
            if not candles or len(candles) < 50:
                return None
                
            # 2. Calculate Indicators
            df = indicator_service.build_dataframe(candles)
            df = indicator_service.compute_indicators(df)
            
            # 3. Calculate Signal Score (skipping MTF to save time for 24 coins)
            signal = signal_service.calculate_score(df, symbol, None)
            
            # 4. Buy Pressure from last candle
            last_c = candles[-1]
            buy_pct = (last_c["taker_buy_volume"] / last_c["volume"]) * 100 if last_c["volume"] > 0 else 50
            
            # 5. Sparkline (Last 20 closing prices)
            sparkline = df['close'].tail(20).tolist()
            
            return TACubeData(
                symbol=symbol,
                price=price,
                change_24h=change_24h,
                volume_usd=volume_usd,
                signal_score=signal.score,
                signal_level=signal.label,
                rsi_14=signal.indicators.rsi,
                macd_value=signal.indicators.macd_line,
                macd_trend=signal.indicators.macd_trend,
                buy_pressure_pct=round(buy_pct, 2),
                sparkline=sparkline
            )

    tasks = [process_coin(t) for t in top_coins]
    completed = await asyncio.gather(*tasks, return_exceptions=True)
    
    for i, res in enumerate(completed):
        if isinstance(res, Exception):
            logger.error(f"Error processing {top_coins[i]['symbol']}: {res}")
        elif isinstance(res, TACubeData):
            results.append(res)
            
    return results


@router.get("/market/buy-sell-pressure/{symbol}")
async def get_buy_sell_pressure(
    symbol: str,
    limit: int = Query(default=24, ge=1, le=48, description="Number of hourly candles"),
):
    """
    Fetch real Taker Buy vs Sell volume from Binance hourly klines.
    Returns list of {hour, buy_volume, sell_volume} for the last N hours.
    This represents actual market pressure — not mock data.
    """
    symbol = symbol.upper()
    candles = await binance_service.fetch_klines(symbol, "1h", limit=limit)
    if not candles:
        return []

    result = []
    for c in candles:
        total_vol = c["volume"]
        taker_buy = c.get("taker_buy_volume", 0)
        taker_sell = total_vol - taker_buy

        # Convert to USDT value using average price
        avg_price = (c["open"] + c["close"]) / 2
        buy_usd = taker_buy * avg_price
        sell_usd = taker_sell * avg_price

        result.append({
            "time": c["open_time"],
            "buy_volume": round(buy_usd, 2),
            "sell_volume": round(sell_usd, 2),
            "buy_pct": round((taker_buy / total_vol) * 100, 2) if total_vol > 0 else 50,
        })

    return result


@router.get("/market/pump-alerts")
async def get_pump_alerts(
    min_change: float = Query(default=2.0, description="Minimum % change to trigger alert"),
    limit: int = Query(default=50, ge=10, le=100, description="Number of coins to scan"),
):
    """
    Scan top volume coins for sudden price movements (pumps/dumps).
    Compares current price with the opening price of the last 5-minute candle
    and the price 15 minutes ago to detect rapid movements.
    Returns list of coins with significant short-term changes.
    """
    # Get top coins by volume
    all_tickers = await binance_service.fetch_all_24h_tickers()
    if not all_tickers:
        return []

    # Filter and sort by volume
    filtered = [t for t in all_tickers if t["volume_usd"] >= 500_000]
    filtered.sort(key=lambda x: x["volume_usd"], reverse=True)
    top_coins = filtered[:limit]

    alerts = []
    sem = asyncio.Semaphore(10)

    async def check_coin(ticker):
        symbol = ticker["symbol"]
        async with sem:
            try:
                # Fetch last 4 x 5-minute candles (= 20 min lookback)
                candles = await binance_service.fetch_klines(symbol, "5m", limit=4)
                if not candles or len(candles) < 2:
                    return None

                current_price = candles[-1]["close"]
                
                # 5-minute change (current vs previous candle open)
                prev_open = candles[-2]["open"]
                change_5m = ((current_price - prev_open) / prev_open) * 100

                # 15-minute change (current vs 3 candles ago)
                if len(candles) >= 4:
                    old_open = candles[0]["open"]
                    change_15m = ((current_price - old_open) / old_open) * 100
                else:
                    change_15m = change_5m

                # Volume spike: compare latest candle volume to average of older candles
                latest_vol = candles[-1]["volume"]
                older_vols = [c["volume"] for c in candles[:-1]]
                avg_vol = sum(older_vols) / len(older_vols) if older_vols else 1
                vol_ratio = latest_vol / avg_vol if avg_vol > 0 else 1

                # Check if this qualifies as a pump or dump
                is_pump = change_5m >= min_change or change_15m >= (min_change * 1.5)
                is_dump = change_5m <= -min_change or change_15m <= -(min_change * 1.5)

                if is_pump or is_dump:
                    return {
                        "symbol": symbol,
                        "price": current_price,
                        "change_5m": round(change_5m, 2),
                        "change_15m": round(change_15m, 2),
                        "change_24h": ticker["change_24h"],
                        "volume_usd": ticker["volume_usd"],
                        "vol_spike": round(vol_ratio, 2),
                        "type": "pump" if is_pump else "dump",
                        "intensity": "extreme" if abs(change_5m) >= min_change * 2.5 else "high" if abs(change_5m) >= min_change * 1.5 else "moderate",
                    }
            except Exception as e:
                logger.debug(f"Error checking {symbol}: {e}")
            return None

    tasks = [check_coin(t) for t in top_coins]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for res in results:
        if isinstance(res, dict):
            alerts.append(res)

    # Sort by absolute 5m change descending (most volatile first)
    alerts.sort(key=lambda x: abs(x["change_5m"]), reverse=True)
    return alerts
