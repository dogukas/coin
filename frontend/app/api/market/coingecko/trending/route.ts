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

export async function GET() {
  try {
    let trending: TrendingResult[] = [];
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/search/trending", {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        next: { revalidate: 300 },
      });

      if (res.ok) {
        const data = await res.json() as { coins?: TrendingItemPayload[] };
        if (Array.isArray(data?.coins)) {
          trending = data.coins.map((c) => ({
            symbol: (c.item?.symbol || "").toUpperCase(),
            name: c.item?.name || "",
            image: c.item?.large || c.item?.small || c.item?.thumb || "",
            market_cap_rank: Number(c.item?.market_cap_rank) || 999,
          }));
        }
      }
    } catch (err) {
      console.warn("CoinGecko trending fetch error:", err);
    }

    if (trending.length === 0) {
      trending = FALLBACK_TRENDING;
    }

    return NextResponse.json(trending);
  } catch (_err: unknown) {
    return NextResponse.json(FALLBACK_TRENDING);
  }
}

const FALLBACK_TRENDING = [
  { symbol: "BTC", name: "Bitcoin", image: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png", market_cap_rank: 1 },
  { symbol: "SOL", name: "Solana", image: "https://coin-images.coingecko.com/coins/images/4128/large/solana.png", market_cap_rank: 5 },
  { symbol: "ETH", name: "Ethereum", image: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png", market_cap_rank: 2 },
  { symbol: "SUI", name: "Sui", image: "https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png", market_cap_rank: 18 },
  { symbol: "NEAR", name: "Near Protocol", image: "https://coin-images.coingecko.com/coins/images/10365/large/near.png", market_cap_rank: 17 },
  { symbol: "XRP", name: "XRP", image: "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png", market_cap_rank: 4 },
  { symbol: "DOGE", name: "Dogecoin", image: "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png", market_cap_rank: 8 },
];
