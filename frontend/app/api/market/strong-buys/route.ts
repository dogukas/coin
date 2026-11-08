import { NextResponse } from "next/server";

export const revalidate = 30;

interface Binance24hRow {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
}

const EXCLUDED_BASES = new Set([
  "USDC",
  "FDUSD",
  "TUSD",
  "USDP",
  "DAI",
  "BUSD",
  "USDE",
  "EUR",
  "GBP",
  "AEUR",
  "USD1",
  "RLUSD",
  "PAXG",
  "WBTC",
]);

function computeRsi(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
    avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return Number((100 - 100 / (1 + rs)).toFixed(1));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(30, Math.max(5, parseInt(searchParams.get("limit") || "15", 10)));

    const res = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr", {
      next: { revalidate: 30 },
    });
    if (!res.ok) return NextResponse.json([]);

    const rows = (await res.json()) as Binance24hRow[];
    const candidates = rows
      .filter((r) => {
        if (!r.symbol.endsWith("USDT")) return false;
        const base = r.symbol.slice(0, -4);
        if (EXCLUDED_BASES.has(base)) return false;
        const qv = parseFloat(r.quoteVolume);
        const chg = parseFloat(r.priceChangePercent);
        return qv >= 8_000_000 && chg > -2 && chg < 25;
      })
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 24);

    const evaluated = await Promise.all(
      candidates.map(async (c) => {
        try {
          const kRes = await fetch(
            `https://data-api.binance.vision/api/v3/klines?symbol=${c.symbol}&interval=1h&limit=30`,
            { next: { revalidate: 30 } }
          );
          if (!kRes.ok) return null;
          const klines = (await kRes.json()) as unknown[][];
          if (!Array.isArray(klines) || klines.length < 20) return null;

          const closes = klines.map((k) => parseFloat(String(k[4])));
          const rsi = computeRsi(closes, 14);
          let totalQv = 0;
          let takerBuyQv = 0;
          for (const k of klines.slice(-6)) {
            totalQv += parseFloat(String(k[7])) || 0;
            takerBuyQv += parseFloat(String(k[10])) || 0;
          }
          const buyPressure = totalQv > 0 ? Number(((takerBuyQv / totalQv) * 100).toFixed(1)) : 50;
          const emaFast = closes.slice(-8).reduce((a, b) => a + b, 0) / 8;
          const emaSlow = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
          const macdTrend = emaFast >= emaSlow ? "bullish" : "bearish";

          let score = 50;
          if (buyPressure >= 53) score += 16;
          else if (buyPressure >= 50.5) score += 8;
          else score -= 10;

          if (rsi !== null) {
            if (rsi >= 45 && rsi <= 66) score += 14;
            else if (rsi < 35) score += 12;
            else if (rsi > 74) score -= 12;
          }

          if (macdTrend === "bullish") score += 14;
          else score -= 10;

          const chg = parseFloat(c.priceChangePercent);
          if (chg > 1 && chg < 12) score += 8;

          score = Math.min(96, Math.max(20, Math.round(score)));
          return {
            symbol: c.symbol,
            price: parseFloat(c.lastPrice),
            change_24h: Number(chg.toFixed(2)),
            volume_usd: Math.round(parseFloat(c.quoteVolume)),
            signal_score: score,
            signal_level: score >= 75 ? "GÜÇLÜ AL" : score >= 60 ? "AL SİNYALİ" : "NÖTR",
            rsi_14: rsi,
            macd_value: Number((emaFast - emaSlow).toFixed(4)),
            macd_trend: macdTrend,
            buy_pressure_pct: buyPressure,
            sparkline: closes.slice(-16),
          };
        } catch {
          return null;
        }
      })
    );

    const signals = evaluated
      .filter((x): x is NonNullable<typeof x> => x !== null && x.signal_score >= 60)
      .sort((a, b) => b.signal_score - a.signal_score)
      .slice(0, limit);

    return NextResponse.json(signals);
  } catch {
    return NextResponse.json([]);
  }
}
