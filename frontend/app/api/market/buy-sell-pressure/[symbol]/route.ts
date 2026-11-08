import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface PressureBar {
  time: number;
  buy_volume: number;
  sell_volume: number;
  buy_pct: number;
}

const BINANCE_KLINE_ENDPOINTS = [
  "https://data-api.binance.vision/api/v3/klines",
  "https://api.binance.com/api/v3/klines",
];

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await context.params;
  const cleanSymbol = (symbol || "BTCUSDT").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const limitParam = Number(req.nextUrl.searchParams.get("limit") || "32");
  const limit = Math.min(60, Math.max(8, Number.isFinite(limitParam) ? limitParam : 32));

  for (const base of BINANCE_KLINE_ENDPOINTS) {
    try {
      const res = await fetch(
        `${base}?symbol=${cleanSymbol}&interval=5m&limit=${limit}`,
        { cache: "no-store" }
      );
      if (!res.ok) continue;
      const raw = (await res.json()) as unknown[][];
      if (!Array.isArray(raw) || raw.length === 0) continue;

      const bars: PressureBar[] = raw.map((k) => {
        const openTimeSec = Math.floor(Number(k[0]) / 1000);
        const quoteVol = parseFloat(String(k[7])) || 0;
        const takerBuyQuote = parseFloat(String(k[10])) || 0;
        const buyVol = Math.min(quoteVol, Math.max(0, takerBuyQuote));
        const sellVol = Math.max(0, quoteVol - buyVol);
        const buyPct = quoteVol > 0 ? Number(((buyVol / quoteVol) * 100).toFixed(1)) : 50;
        return {
          time: openTimeSec,
          buy_volume: Number(buyVol.toFixed(2)),
          sell_volume: Number(sellVol.toFixed(2)),
          buy_pct: buyPct,
        };
      });

      return NextResponse.json(bars);
    } catch {
      // try next endpoint
    }
  }

  return NextResponse.json([], { status: 200 });
}

