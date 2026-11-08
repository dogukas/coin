import { NextResponse } from "next/server";

export const revalidate = 600; // Cache 10 minutes

interface CoinGeckoMarketItem {
  symbol?: string;
  image?: string;
}

export async function GET() {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=150&page=1&sparkline=false", {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      next: { revalidate: 600 },
    });

    const logoMap: Record<string, string> = { ...FALLBACK_LOGOS };
    if (res.ok) {
      const data: unknown = await res.json();
      if (Array.isArray(data)) {
        for (const coin of data as CoinGeckoMarketItem[]) {
          const sym = (coin.symbol || "").toUpperCase();
          const targetKey = sym.endsWith("USDT") ? sym : `${sym}USDT`;
          if (coin.image) {
            logoMap[targetKey] = coin.image;
          }
        }
      }
    }

    return NextResponse.json(logoMap);
  } catch (_err: unknown) {
    return NextResponse.json(FALLBACK_LOGOS);
  }
}

const FALLBACK_LOGOS: Record<string, string> = {
  BTCUSDT: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
  ETHUSDT: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png",
  SOLUSDT: "https://coin-images.coingecko.com/coins/images/4128/large/solana.png",
  XRPUSDT: "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png",
  DOGEUSDT: "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png",
  SUIUSDT: "https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png",
  NEARUSDT: "https://coin-images.coingecko.com/coins/images/10365/large/near.png",
  LINKUSDT: "https://coin-images.coingecko.com/coins/images/877/large/chainlink-new-logo.png",
  AVAXUSDT: "https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png",
  ADAUSDT: "https://coin-images.coingecko.com/coins/images/975/large/cardano.png",
};
