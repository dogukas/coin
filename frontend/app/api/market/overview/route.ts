import { NextResponse } from "next/server";

export const revalidate = 20; // 20s cache

interface Binance24hRow {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
  count: number;
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

const CATEGORY_MAP: Record<string, string> = {
  BTC: "Layer 1",
  ETH: "Layer 1",
  SOL: "Layer 1",
  BNB: "Exchange",
  XRP: "Payment",
  ADA: "Layer 1",
  AVAX: "Layer 1",
  SUI: "Layer 1",
  NEAR: "AI & L1",
  APT: "Layer 1",
  SEI: "Layer 1",
  TON: "Layer 1",
  DOT: "Layer 0",
  ATOM: "Layer 0",
  ARB: "Layer 2",
  OP: "Layer 2",
  POL: "Layer 2",
  LINK: "Oracle",
  UNI: "DeFi",
  AAVE: "DeFi",
  ENA: "DeFi",
  PENDLE: "DeFi",
  ONDO: "RWA",
  FET: "AI",
  TAO: "AI",
  RENDER: "AI",
  WLD: "AI",
  DOGE: "Meme",
  SHIB: "Meme",
  PEPE: "Meme",
  WIF: "Meme",
  BONK: "Meme",
  FLOKI: "Meme",
  TRUMP: "Meme",
};

const BINANCE_ENDPOINTS = [
  "https://data-api.binance.vision/api/v3/ticker/24hr",
  "https://api.binance.com/api/v3/ticker/24hr",
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") || "30", 10)));

    let rows: Binance24hRow[] = [];
    for (const url of BINANCE_ENDPOINTS) {
      try {
        const res = await fetch(url, { next: { revalidate: 20 } });
        if (res.ok) {
          const data = (await res.json()) as Binance24hRow[];
          if (Array.isArray(data) && data.length > 0) {
            rows = data;
            break;
          }
        }
      } catch {
        // try next endpoint
      }
    }

    const usdtCoins = rows
      .filter((r) => {
        if (!r.symbol.endsWith("USDT")) return false;
        const base = r.symbol.slice(0, -4);
        if (EXCLUDED_BASES.has(base)) return false;
        if (base.endsWith("UP") || base.endsWith("DOWN") || base.endsWith("BULL") || base.endsWith("BEAR")) {
          return false;
        }
        const price = parseFloat(r.lastPrice);
        const qv = parseFloat(r.quoteVolume);
        return Number.isFinite(price) && price > 0 && Number.isFinite(qv) && qv >= 1_000_000;
      })
      .map((r) => {
        const base = r.symbol.slice(0, -4);
        const price = parseFloat(r.lastPrice);
        const change24h = parseFloat(r.priceChangePercent);
        const volumeUsd = parseFloat(r.quoteVolume);
        const high = parseFloat(r.highPrice);
        const low = parseFloat(r.lowPrice);
        // Position within 24h range as an indicator of intraday buying support
        const range = high > low ? (price - low) / (high - low) : 0.5;
        const buyPressurePct = Math.round(Math.min(88, Math.max(15, range * 100)));

        return {
          symbol: r.symbol,
          price,
          change_24h: Number(change24h.toFixed(2)),
          volume_usd: Math.round(volumeUsd),
          high_24h: high,
          low_24h: low,
          category: CATEGORY_MAP[base] || null,
          buy_pressure_pct: buyPressurePct,
          logo: "",
        };
      });

    const popular = [...usdtCoins].sort((a, b) => b.volume_usd - a.volume_usd);
    const gainers = [...usdtCoins].sort((a, b) => b.change_24h - a.change_24h);
    const losers = [...usdtCoins].sort((a, b) => a.change_24h - b.change_24h);

    return NextResponse.json({
      popular: popular.slice(0, limit),
      gainers: gainers.slice(0, limit),
      losers: losers.slice(0, limit),
      top_volume: popular.slice(0, limit),
      coins: popular.slice(0, limit),
      total_count: usdtCoins.length,
    });
  } catch (_err: unknown) {
    return NextResponse.json({
      popular: [],
      gainers: [],
      losers: [],
      top_volume: [],
      coins: [],
      total_count: 0,
    });
  }
}
