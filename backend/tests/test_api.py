import pytest
import pandas as pd
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.services.indicator_service import indicator_service
from app.services.signal_service import signal_service


def test_health_check():
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "binance" in data


def test_indicator_computation():
    # Generate 100 sample candles
    sample_candles = []
    base_price = 50000.0
    for i in range(100):
        price = base_price + np.sin(i / 5.0) * 500.0
        sample_candles.append({
            "open_time": 1700000000000 + i * 900000,
            "open": price - 10,
            "high": price + 20,
            "low": price - 20,
            "close": price + 5,
            "volume": 100.0 + i * 2,
            "taker_buy_volume": 60.0 + i,
        })

    df = indicator_service.build_dataframe(sample_candles)
    assert not df.empty
    assert len(df) == 100

    enriched = indicator_service.compute_indicators(df)
    assert "rsi" in enriched.columns
    assert "MACD_12_26_9" in enriched.columns
    assert "BBU_20_2.0" in enriched.columns
    assert "BBL_20_2.0" in enriched.columns

    # Test signal scoring
    signal = signal_service.calculate_score(enriched, "BTCUSDT")
    assert 0 <= signal.score <= 100
    assert signal.label in ["GÜÇLÜ AL SİNYALİ", "AL SİNYALİ", "BEKLE / NÖTR", "SAT / ZAYIF"]
