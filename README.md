# 🚀 Crypto Signal Dashboard V1

Real-time cryptocurrency analysis and signal generation engine. Fetches live market data from Binance, computes technical indicators, and streams scored buy/sell signals to a premium dark-themed dashboard.

> ⚠️ **Read-Only Analysis Tool** — No trading execution. This is strictly a signal engine for educational/analytical purposes.

---

## Architecture

```
┌──────────────┐     REST/WS      ┌──────────────┐     WebSocket     ┌──────────────┐
│   Binance    │ ──────────────▶  │   FastAPI     │ ──────────────▶  │   Next.js    │
│   Exchange   │   OHLCV Stream   │   Backend     │   Signal Stream   │   Frontend   │
└──────────────┘                  │               │                  │              │
                                  │  ┌──────────┐ │                  │  📊 Charts   │
                                  │  │pandas-ta │ │                  │  📈 Signals  │
                                  │  │Indicators│ │                  │  📋 Watchlist│
                                  │  └──────────┘ │                  └──────────────┘
                                  │  ┌──────────┐ │
                                  │  │ Signal   │ │
                                  │  │ Scorer   │ │
                                  │  └──────────┘ │
                                  └──────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11+, FastAPI, Uvicorn |
| **Data** | pandas, pandas-ta |
| **Exchange** | Binance REST + WebSocket (native aiohttp/websockets) |
| **Database** | SQLite (aiosqlite) |
| **Frontend** | Next.js 15, TypeScript, Tailwind CSS |
| **Charts** | TradingView Lightweight Charts v4 |
| **State** | Zustand |

## Signal Scoring (0–100)

| Condition | Points |
|-----------|--------|
| EMA20 > EMA50 | +15 |
| MACD Histogram > 0 | +20 |
| RSI in 40–65 range | +15 |
| Price > VWAP | +15 |
| Volume > Volume MA | +15 |
| Multi-TF Trend Aligned (1h+4h) | +20 |

| Score Range | Label |
|-------------|-------|
| 0–35 | SAT / ZAYIF |
| 36–55 | BEKLE / NÖTR |
| 56–75 | AL SİNYALİ |
| 76–100 | GÜÇLÜ AL SİNYALİ |

---

## Quick Start

### 1. Backend

```bash
cd crypto-bot/backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Copy env file (optional — works without API keys)
copy .env.example .env

# Start server
uvicorn app.main:app --reload --port 8000
```

The backend will be available at `http://localhost:8000`.

- Health: `GET /api/health`
- Symbols: `GET /api/symbols`
- History: `GET /api/history/BTCUSDT?interval=15m&limit=500`
- Signal: `GET /api/signal/BTCUSDT`
- WebSocket: `ws://localhost:8000/ws/market/BTCUSDT`

### 2. Frontend

```bash
cd crypto-bot/frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open `http://localhost:3000` to see the dashboard.

---

## Project Structure

```
crypto-bot/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── endpoints.py       # REST: health, symbols, history, signal
│   │   │   └── websocket.py       # WS proxy: /ws/market/{symbol}
│   │   ├── core/
│   │   │   ├── config.py          # Pydantic settings from .env
│   │   │   └── database.py        # Async SQLite engine
│   │   ├── models/
│   │   │   └── candle.py          # ORM + Pydantic schemas
│   │   ├── services/
│   │   │   ├── binance_service.py # REST fetch + WS streaming
│   │   │   ├── indicator_service.py # pandas-ta computations
│   │   │   └── signal_service.py  # Weighted scoring engine
│   │   └── main.py                # FastAPI entry + CORS
│   ├── .env / .env.example
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx               # Main dashboard
│   ├── components/
│   │   ├── charts/
│   │   │   └── CandlestickChart.tsx
│   │   └── dashboard/
│   │       ├── SignalCard.tsx
│   │       ├── IndicatorGrid.tsx
│   │       └── Watchlist.tsx
│   └── lib/
│       ├── store.ts               # Zustand state
│       └── utils.ts               # Types, formatters, WS manager
└── README.md
```

---

## API Keys

Binance API keys are **optional** for this read-only dashboard. All market data endpoints used are public. If you want to add keys later:

```env
BINANCE_API_KEY=your_key_here
BINANCE_API_SECRET=your_secret_here
```

## License

MIT — For educational and analytical purposes only. Not financial advice.
