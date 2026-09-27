"""
Signal scoring engine — weighted 0-100 score based on technical indicators.
Generates buy/sell/hold signals with Turkish reasoning explanations.
"""

import logging
import time
from typing import Dict, List, Optional

import pandas as pd

from app.models.candle import SignalPayload, IndicatorData
from app.services.indicator_service import indicator_service

logger = logging.getLogger(__name__)


class SignalService:
    """Calculates weighted signal scores and generates reasoning."""

    # Score label mapping
    LABELS = {
        (0, 35): "SAT / ZAYIF",
        (36, 55): "BEKLE / NÖTR",
        (56, 75): "AL SİNYALİ",
        (76, 100): "GÜÇLÜ AL SİNYALİ",
    }

    def get_label(self, score: int) -> str:
        """Map a numeric score to its Turkish label."""
        for (low, high), label in self.LABELS.items():
            if low <= score <= high:
                return label
        return "BEKLE / NÖTR"

    def calculate_score(
        self,
        df: pd.DataFrame,
        symbol: str,
        mtf_data: Optional[Dict[str, pd.DataFrame]] = None,
    ) -> SignalPayload:
        """
        Calculate the composite signal score (0–100) from indicator-enriched DataFrame.

        Args:
            df: OHLCV DataFrame with indicators already computed.
            symbol: Trading pair symbol (e.g., "BTCUSDT").
            mtf_data: Optional dict of higher-timeframe DataFrames
                       e.g. {"1h": df_1h, "4h": df_4h} for multi-TF check.

        Returns:
            SignalPayload with score, label, indicators, and reasoning.
        """
        if df.empty:
            return self._empty_signal(symbol)

        # Extract latest indicator values
        indicators_dict = indicator_service.extract_latest_indicators(df)
        indicators = IndicatorData(**indicators_dict)
        latest = df.iloc[-1]
        current_price = float(latest["close"])

        score = 0
        reasons: List[str] = []

        # ── Rule 1: EMA20 > EMA50 (+15 points) ──
        if indicators.ema_20 is not None and indicators.ema_50 is not None:
            if indicators.ema_20 > indicators.ema_50:
                score += 15
                reasons.append("✓ EMA20 EMA50'nin üzerinde")
            else:
                reasons.append("✗ EMA20 EMA50'nin altında")

        # ── Rule 2: MACD Histogram Bullish (+20 points) ──
        if indicators.macd_histogram is not None:
            if indicators.macd_histogram > 0:
                score += 20
                reasons.append("✓ MACD histogramı pozitif — yükseliş momentumu")
            else:
                reasons.append("✗ MACD histogramı negatif — düşüş momentumu")

        # ── Rule 3: RSI between 40–65 (+15 points) ──
        if indicators.rsi is not None:
            if 40 <= indicators.rsi <= 65:
                score += 15
                reasons.append(f"✓ RSI nötr-bullish bölgede ({indicators.rsi:.1f})")
            elif indicators.rsi > 65:
                reasons.append(f"✗ RSI aşırı alım bölgesine yakın ({indicators.rsi:.1f})")
            else:
                reasons.append(f"✗ RSI aşırı satım bölgesinde ({indicators.rsi:.1f})")

        # ── Rule 4: Price > VWAP (+15 points) ──
        if indicators.vwap is not None:
            if current_price > indicators.vwap:
                score += 15
                reasons.append("✓ Fiyat VWAP üzerinde seyrediyor")
            else:
                reasons.append("✗ Fiyat VWAP altında seyrediyor")

        # ── Rule 5: Volume > Volume MA (+15 points) ──
        if indicators.current_volume is not None and indicators.volume_ma is not None:
            if indicators.current_volume > indicators.volume_ma:
                score += 15
                reasons.append("✓ Hacim ortalamanın üzerinde — güçlü katılım")
            else:
                reasons.append("✗ Hacim ortalamanın altında — zayıf katılım")

        # ── Rule 6: Multi-timeframe trend alignment (+20 points) ──
        mtf_score = self._check_multi_timeframe(mtf_data)
        if mtf_score > 0:
            score += mtf_score
            reasons.append("✓ Çoklu zaman dilimi trendi uyumlu (1s + 4s)")
        elif mtf_data is not None:
            reasons.append("✗ Çoklu zaman dilimi trendleri uyumsuz")

        # Clamp score
        score = max(0, min(100, score))
        label = self.get_label(score)

        return SignalPayload(
            symbol=symbol,
            price=round(current_price, 2),
            score=score,
            label=label,
            indicators=indicators,
            reasons=reasons,
            timestamp=int(time.time()),
        )

    def _check_multi_timeframe(
        self,
        mtf_data: Optional[Dict[str, pd.DataFrame]],
    ) -> int:
        """
        Check if higher timeframes (1h, 4h) show aligned bullish trend.
        Awards +20 if both 1h and 4h EMA20 > EMA50.
        Awards +10 if only one timeframe is bullish.
        """
        if not mtf_data:
            return 0

        bullish_count = 0
        total = 0

        for tf, df in mtf_data.items():
            if df.empty or len(df) < 50:
                continue

            # Compute indicators for this timeframe
            enriched = indicator_service.compute_indicators(df.copy())
            ind = indicator_service.extract_latest_indicators(enriched)

            ema20 = ind.get("ema_20")
            ema50 = ind.get("ema_50")

            if ema20 is not None and ema50 is not None:
                total += 1
                if ema20 > ema50:
                    bullish_count += 1

        if total == 0:
            return 0
        if bullish_count == total:
            return 20  # All higher TFs aligned
        if bullish_count > 0:
            return 10  # Partial alignment
        return 0

    def _empty_signal(self, symbol: str) -> SignalPayload:
        """Return a zeroed-out signal when no data is available."""
        return SignalPayload(
            symbol=symbol,
            price=0.0,
            score=0,
            label="BEKLE / NÖTR",
            indicators=IndicatorData(),
            reasons=["⚠ Yeterli veri yok — sinyal hesaplanamadı"],
            timestamp=int(time.time()),
        )


# Singleton instance
signal_service = SignalService()
