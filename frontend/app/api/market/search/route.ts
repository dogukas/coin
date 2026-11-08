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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim().toUpperCase();
    if (!q) return NextResponse.json([]);

    const res = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr", {
      next: { revalidate: 30 },
    });
    if (!res.ok) return NextResponse.json([]);

    const rows = (await res.json()) as Binance24hRow[];
    const matches = rows
      .filter((r) => r.symbol.endsWith("USDT") && r.symbol.includes(q))
      .map((r) => ({
        symbol: r.symbol,
        price: parseFloat(r.lastPrice) || 0,
        change_24h: Number((parseFloat(r.priceChangePercent) || 0).toFixed(2)),
        volume_usd: Math.round(parseFloat(r.quoteVolume) || 0),
        high_24h: parseFloat(r.highPrice) || null,
        low_24h: parseFloat(r.lowPrice) || null,
        category: null,
      }))
      .filter((r) => r.price > 0 && r.volume_usd > 50_000)
      .sort((a, b) => b.volume_usd - a.volume_usd)
      .slice(0, 30);

    return NextResponse.json(matches);
  } catch {
    return NextResponse.json([]);
  }
}
