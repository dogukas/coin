import { NextResponse } from "next/server";

export const revalidate = 3600; // 1 hour cache

interface CoinGeckoLogoItem {
  symbol?: string;
  image?: string;
}

const STATIC_CORE_LOGOS: Record<string, string> = {
  BTCUSDT: "https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png",
  ETHUSDT: "https://coin-images.coingecko.com/coins/images/279/small/ethereum.png",
  SOLUSDT: "https://coin-images.coingecko.com/coins/images/4128/small/solana.png",
  BNBUSDT: "https://coin-images.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
  XRPUSDT: "https://coin-images.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png",
  DOGEUSDT: "https://coin-images.coingecko.com/coins/images/5/small/dogecoin.png",
  ADAUSDT: "https://coin-images.coingecko.com/coins/images/975/small/cardano.png",
  AVAXUSDT: "https://coin-images.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png",
  SUIUSDT: "https://coin-images.coingecko.com/coins/images/26375/small/sui-ocean-square.png",
  LINKUSDT: "https://coin-images.coingecko.com/coins/images/877/small/chainlink-new-logo.png",
  NEARUSDT: "https://coin-images.coingecko.com/coins/images/10365/small/near.png",
  PEPEUSDT: "https://coin-images.coingecko.com/coins/images/29850/small/pepe-token.jpeg",
  TRXUSDT: "https://coin-images.coingecko.com/coins/images/1094/small/tron-logo.png",
  TONUSDT: "https://coin-images.coingecko.com/coins/images/17980/small/ton_symbol.png",
  SHIBUSDT: "https://coin-images.coingecko.com/coins/images/11939/small/shiba.png",
  DOTUSDT: "https://coin-images.coingecko.com/coins/images/12171/small/polkadot.png",
  LTCUSDT: "https://coin-images.coingecko.com/coins/images/2/small/litecoin.png",
  UNIUSDT: "https://coin-images.coingecko.com/coins/images/12504/small/uniswap-logo.png",
  APTUSDT: "https://coin-images.coingecko.com/coins/images/26455/small/aptos_round.png",
  AAVEUSDT: "https://coin-images.coingecko.com/coins/images/12645/small/AAVE.png",
};

export async function GET() {
  const map: Record<string, string> = { ...STATIC_CORE_LOGOS };
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false",
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 3600 },
      }
    );
    if (res.ok) {
      const items = (await res.json()) as CoinGeckoLogoItem[];
      if (Array.isArray(items)) {
        for (const item of items) {
          const sym = (item.symbol || "").toUpperCase();
          if (sym && item.image) {
            map[`${sym}USDT`] = item.image;
          }
        }
      }
    }
  } catch {
    // use static core logos map
  }
  return NextResponse.json(map);
}
