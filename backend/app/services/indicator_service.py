"""
Technical indicator computation engine — pure pandas/numpy implementation.
No pandas-ta/numba dependency — compatible with Python 3.14+.
Computes RSI, MACD, EMA, Bollinger Bands, Volume MA, and VWAP.
"""

import logging
import math
from typing import List

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


class IndicatorService:
    """Computes all technical indicators on OHLCV DataFrames using pure pandas."""

    @staticmethod
    def build_dataframe(candles: List[dict]) -> pd.DataFrame:
        """
        Convert a list of candle dicts to a pandas DataFrame.
        """
        if not candles:
            return pd.DataFrame()

        df = pd.DataFrame(candles)

        # Ensure numeric types
        for col in ["open", "high", "low", "close", "volume"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        # Sort by time
        if "open_time" in df.columns:
            df = df.sort_values("open_time").reset_index(drop=True)

        return df

    @staticmethod
    def _ema(series: pd.Series, length: int) -> pd.Series:
        """Exponential Moving Average."""
        return series.ewm(span=length, adjust=False).mean()

    @staticmethod
    def _sma(series: pd.Series, length: int) -> pd.Series:
        """Simple Moving Average."""
        return series.rolling(window=length).mean()

    @staticmethod
    def _rsi(close: pd.Series, length: int = 14) -> pd.Series:
        """Relative Strength Index (Wilder's smoothing)."""
        delta = close.diff()
        gain = delta.where(delta > 0, 0.0)
        loss = (-delta).where(delta < 0, 0.0)

        # Wilder's smoothing (EMA with alpha=1/length)
        avg_gain = gain.ewm(alpha=1.0 / length, min_periods=length, adjust=False).mean()
        avg_loss = loss.ewm(alpha=1.0 / length, min_periods=length, adjust=False).mean()

        # Safe division handling for loss == 0
        safe_loss = avg_loss.replace(0, np.nan)
        rs = avg_gain / safe_loss
        rsi = 100.0 - (100.0 / (1.0 + rs))
        
        # When loss is 0 and gain > 0 -> RSI = 100; when gain is 0 -> RSI = 0
        rsi = rsi.fillna(100.0).where((avg_loss != 0) | (avg_gain == 0), 100.0)
        rsi = rsi.where(avg_gain != 0, 0.0)
        return rsi

    @staticmethod
    def _macd(
        close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9
    ) -> tuple:
        """MACD — returns (macd_line, signal_line, histogram)."""
        ema_fast = close.ewm(span=fast, adjust=False).mean()
        ema_slow = close.ewm(span=slow, adjust=False).mean()
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()
        histogram = macd_line - signal_line
        return macd_line, signal_line, histogram

    @staticmethod
    def _bbands(
        close: pd.Series, length: int = 20, std: float = 2.0
    ) -> tuple:
        """Bollinger Bands — returns (upper, middle, lower)."""
        middle = close.rolling(window=length).mean()
        rolling_std = close.rolling(window=length).std()
        upper = middle + (rolling_std * std)
        lower = middle - (rolling_std * std)
        return upper, middle, lower

    def compute_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Append all technical indicators to the DataFrame.
        Returns enriched DataFrame with indicator columns.
        """
        if df.empty or len(df) < 30:
            logger.warning(f"Insufficient data for indicators: {len(df)} rows")
            return df

        try:
            # ── RSI (14) ──
            df["rsi"] = self._rsi(df["close"], length=14)

            # ── MACD (12, 26, 9) ──
            macd_line, macd_signal, macd_hist = self._macd(df["close"], 12, 26, 9)
            df["MACD_12_26_9"] = macd_line
            df["MACDs_12_26_9"] = macd_signal
            df["MACDh_12_26_9"] = macd_hist

            # ── EMA (20, 50, 200) ──
            df["ema_20"] = self._ema(df["close"], 20)
            df["ema_50"] = self._ema(df["close"], 50)
            df["ema_200"] = self._ema(df["close"], 200)

            # ── Bollinger Bands (20, 2) ──
            bb_upper, bb_middle, bb_lower = self._bbands(df["close"], 20, 2.0)
            df["BBU_20_2.0"] = bb_upper
            df["BBM_20_2.0"] = bb_middle
            df["BBL_20_2.0"] = bb_lower

            # ── Volume SMA (20) ──
            df["volume_ma"] = self._sma(df["volume"], 20)

            # ── VWAP (Daily Session UTC) ──
            try:
                typical_price = (df["high"] + df["low"] + df["close"]) / 3.0
                if "open_time" in df.columns:
                    # Anchor VWAP to UTC calendar day (Standard TradingView / Binance session VWAP)
                    dates = pd.to_datetime(df["open_time"], unit="ms", utc=True).dt.date
                    tp_vol = typical_price * df["volume"]
                    cum_tp_vol = tp_vol.groupby(dates).cumsum()
                    cum_vol = df["volume"].groupby(dates).cumsum().replace(0, np.nan)
                    df["vwap"] = cum_tp_vol / cum_vol
                else:
                    cum_tp_vol = (typical_price * df["volume"]).cumsum()
                    cum_vol = df["volume"].cumsum().replace(0, np.nan)
                    df["vwap"] = cum_tp_vol / cum_vol
            except Exception as e:
                logger.warning(f"VWAP calculation error: {e}")

        except Exception as e:
            logger.error(f"Error computing indicators: {e}")

        return df

    @staticmethod
    def extract_latest_indicators(df: pd.DataFrame) -> dict:
        """
        Extract the latest indicator values from the enriched DataFrame.
        Returns a dict suitable for IndicatorData schema.
        """
        if df.empty:
            return {}

        latest = df.iloc[-1]

        def safe_float(val):
            """Safely convert to float, return None for NaN."""
            try:
                v = float(val)
                return None if math.isnan(v) else round(v, 4)
            except (ValueError, TypeError):
                return None

        # Determine MACD trend
        macd_hist = safe_float(latest.get("MACDh_12_26_9"))
        macd_trend = None
        if macd_hist is not None:
            macd_trend = "bullish" if macd_hist > 0 else "bearish"

        # Determine EMA trend
        ema20 = safe_float(latest.get("ema_20"))
        ema50 = safe_float(latest.get("ema_50"))
        ema_trend = "neutral"
        if ema20 is not None and ema50 is not None:
            if ema20 > ema50:
                ema_trend = "bullish_cross"
            else:
                ema_trend = "bearish_cross"
                
        # Calculate Buy Pressure %
        buy_pressure_pct = None
        taker_buy = safe_float(latest.get("taker_buy_volume"))
        vol = safe_float(latest.get("volume"))
        if taker_buy is not None and vol is not None and vol > 0:
            buy_pressure_pct = round((taker_buy / vol) * 100, 2)

        return {
            "rsi": safe_float(latest.get("rsi")),
            "macd_line": safe_float(latest.get("MACD_12_26_9")),
            "macd_signal": safe_float(latest.get("MACDs_12_26_9")),
            "macd_histogram": macd_hist,
            "macd_trend": macd_trend,
            "ema_20": ema20,
            "ema_50": ema50,
            "ema_200": safe_float(latest.get("ema_200")),
            "ema_trend": ema_trend,
            "bb_upper": safe_float(latest.get("BBU_20_2.0")),
            "bb_middle": safe_float(latest.get("BBM_20_2.0")),
            "bb_lower": safe_float(latest.get("BBL_20_2.0")),
            "vwap": safe_float(latest.get("vwap")),
            "volume_ma": safe_float(latest.get("volume_ma")),
            "current_volume": vol,
            "buy_pressure_pct": buy_pressure_pct,
        }


# Singleton instance
indicator_service = IndicatorService()
