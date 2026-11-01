import { NextResponse } from "next/server";

export const revalidate = 60; // 1 minute cache

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "30", 10);

    let coins: any[] = [];
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=60&page=1&sparkline=false`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          next: { revalidate: 60 },
        }
      );
      if (res.ok) {
        coins = await res.json();
      }
    } catch (err) {
      console.warn("Overview CG fetch error:", err);
    }

    if (!Array.isArray(coins) || coins.length === 0) {
      coins = FALLBACK_ITEMS;
    }

    const formatted = coins.map((c: any) => {
      const raw = (c.symbol || "").toUpperCase();
      const symbol = raw.endsWith("USDT") ? raw : `${raw}USDT`;
      return {
        symbol,
        price: Number(c.current_price) || 0,
        change_24h: Number((c.price_change_percentage_24h || 0).toFixed(2)),
        volume_usd: Number(c.total_volume) || 0,
        logo: c.image || "",
      };
    });

    const gainers = [...formatted].sort((a, b) => b.change_24h - a.change_24h);
    const losers = [...formatted].sort((a, b) => a.change_24h - b.change_24h);
    const topVolume = [...formatted].sort((a, b) => b.volume_usd - a.volume_usd);

    return NextResponse.json({
      gainers: gainers.slice(0, limit),
      losers: losers.slice(0, limit),
      top_volume: topVolume.slice(0, limit),
      coins: formatted.slice(0, limit),
    });
  } catch (err: any) {
    return NextResponse.json({
      gainers: [],
      losers: [],
      top_volume: [],
      coins: [],
    });
  }
}

const FALLBACK_ITEMS = [
  { symbol: "btc", current_price: 80800, price_change_percentage_24h: 1.25, total_volume: 45000000000, image: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png" },
  { symbol: "eth", current_price: 2355, price_change_percentage_24h: 2.1, total_volume: 22000000000, image: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png" },
  { symbol: "sol", current_price: 101.8, price_change_percentage_24h: 4.8, total_volume: 8500000000, image: "https://coin-images.coingecko.com/coins/images/4128/large/solana.png" },
  { symbol: "sui", current_price: 0.92, price_change_percentage_24h: 5.2, total_volume: 1800000000, image: "https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png" },
  { symbol: "near", current_price: 4.65, price_change_percentage_24h: 6.1, total_volume: 950000000, image: "https://coin-images.coingecko.com/coins/images/10365/large/near.png" },
  { symbol: "xrp", current_price: 1.30, price_change_percentage_24h: 3.1, total_volume: 4200000000, image: "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png" },
  { symbol: "doge", current_price: 0.077, price_change_percentage_24h: 1.4, total_volume: 1200000000, image: "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png" },
];
