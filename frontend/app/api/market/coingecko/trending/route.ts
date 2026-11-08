import { NextResponse } from "next/server";

export const revalidate = 300; // Cache 5 minutes

interface TrendingItemPayload {
  item?: {
    symbol?: string;
    name?: string;
    large?: string;
    small?: string;
    thumb?: string;
    market_cap_rank?: number | string;
  };
}

interface TrendingResult {
  symbol: string;
  name: string;
  image: string;
  market_cap_rank: number;
}

interface Binance24hRow {
  symbol: string;
  quoteVolume: string;
  priceChangePercent: string;
}

export async function GET() {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/search/trending", {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 300 },
    });

    if (res.ok) {
      const data = (await res.json()) as { coins?: TrendingItemPayload[] };
      if (Array.isArray(data?.coins) && data.coins.length > 0) {
        const trending: TrendingResult[] = data.coins.map((c) => ({
          symbol: (c.item?.symbol || "").toUpperCase(),
          name: c.item?.name || "",
          image: c.item?.large || c.item?.small || c.item?.thumb || "",
          market_cap_rank: Number(c.item?.market_cap_rank) || 999,
        }));
        return NextResponse.json(trending);
      }
    }
  } catch (err) {
    console.warn("CoinGecko trending fetch error:", err);
  }

  // Fallback: Live top momentum coins from Binance 24hr tickers
  try {
    const binRes = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr", {
      next: { revalidate: 120 },
    });
    if (binRes.ok) {
      const rows = (await binRes.json()) as Binance24hRow[];
      const topMomentum = rows
        .filter((r) => r.symbol.endsWith("USDT") && parseFloat(r.quoteVolume) >= 15_000_000)
        .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
        .slice(0, 7)
        .map((r, i) => {
          const base = r.symbol.slice(0, -4);
          return {
            symbol: base,
            name: base,
            image: "",
            market_cap_rank: i + 1,
          };
        });
      return NextResponse.json(topMomentum);
    }
  } catch {
    // ignore
  }

  return NextResponse.json([]);
}
