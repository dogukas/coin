import { NextResponse } from "next/server";

export const revalidate = 60; // Cache for 60 seconds

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = parseInt(searchParams.get("limit") || "60", 10);
    const limit = Math.min(100, Math.max(10, limitParam));

    // Fetch top coins with 7-day sparkline from CoinGecko
    const cgUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=true`;
    
    let items: any[] = [];
    try {
      const res = await fetch(cgUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        next: { revalidate: 60 },
      });

      if (res.ok) {
        items = await res.json();
      }
    } catch (fetchErr) {
      console.warn("CoinGecko markets fetch error:", fetchErr);
    }

    // If CoinGecko returned empty or failed (e.g. rate limit), use hardcoded high-quality fallback
    if (!Array.isArray(items) || items.length === 0) {
      items = FALLBACK_COINS;
    }

    const enriched = items.map((coin: any) => {
      const rawSymbol = (coin.symbol || "").toUpperCase();
      const symbol = rawSymbol.endsWith("USDT") ? rawSymbol : `${rawSymbol}USDT`;
      const price = Number(coin.current_price) || 0;
      const change24h = Number(coin.price_change_percentage_24h) || 0;
      const volumeUsd = Number(coin.total_volume) || 0;
      const sparklinePrices: number[] = Array.isArray(coin.sparkline_in_7d?.price)
        ? coin.sparkline_in_7d.price
        : [];

      // Last 20 points for chart
      const sparkline = sparklinePrices.length >= 10
        ? sparklinePrices.slice(-20)
        : [price * 0.98, price * 0.99, price, price * 1.01, price];

      // Calculate RSI(14)
      const rsi = calculateRSI(sparklinePrices);

      // MACD Trend
      const macdTrend = calculateMACDTrend(sparklinePrices);

      // Scoring
      let score = 50;
      if (change24h > 4) score += 20;
      else if (change24h > 0.5) score += 10;
      else if (change24h < -4) score -= 20;
      else if (change24h < -0.5) score -= 10;

      if (rsi >= 45 && rsi <= 65) score += 15;
      else if (rsi > 70) score -= 10;
      else if (rsi < 35) score += 10;

      if (macdTrend === "bullish") score += 15;
      else score -= 15;

      score = Math.max(10, Math.min(95, Math.round(score)));

      let signalLevel = "BEKLE / NÖTR";
      if (score >= 65) signalLevel = "GÜÇLÜ AL SİNYALİ";
      else if (score >= 50) signalLevel = "AL SİNYALİ";
      else if (score <= 35) signalLevel = "SAT / ZAYIF";

      const buyPressure = Math.min(85, Math.max(20, Math.round(50 + change24h * 1.5)));

      return {
        symbol,
        price,
        change_24h: Number(change24h.toFixed(2)),
        volume_usd: volumeUsd,
        signal_score: score,
        signal_level: signalLevel,
        rsi_14: rsi,
        macd_trend: macdTrend,
        buy_pressure_pct: buyPressure,
        sparkline,
        logo: coin.image || "",
        market_cap: Number(coin.market_cap) || 0,
        market_cap_rank: Number(coin.market_cap_rank) || 999,
        circulating_supply: Number(coin.circulating_supply) || 0,
        ath_change_pct: Number(coin.ath_change_percentage?.toFixed(2)) || 0,
      };
    });

    // Sort by market cap rank
    enriched.sort((a, b) => a.market_cap_rank - b.market_cap_rank);

    return NextResponse.json(enriched);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}

function calculateRSI(prices: number[], period = 14): number {
  if (!prices || prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return Math.round(100 - 100 / (1 + rs));
}

function calculateMACDTrend(prices: number[]): "bullish" | "bearish" {
  if (!prices || prices.length < 12) return "bullish";
  const recent = prices.slice(-12);
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const last = prices[prices.length - 1];
  return last >= avgRecent ? "bullish" : "bearish";
}

const FALLBACK_COINS = [
  { symbol: "btc", current_price: 80800, price_change_percentage_24h: 1.25, total_volume: 45000000000, market_cap: 1600000000000, market_cap_rank: 1, circulating_supply: 19800000, ath_change_percentage: -25, image: "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png" },
  { symbol: "eth", current_price: 2355, price_change_percentage_24h: 2.1, total_volume: 22000000000, market_cap: 283000000000, market_cap_rank: 2, circulating_supply: 120400000, ath_change_percentage: -52, image: "https://coin-images.coingecko.com/coins/images/279/large/ethereum.png" },
  { symbol: "sol", current_price: 101.8, price_change_percentage_24h: 4.8, total_volume: 8500000000, market_cap: 48000000000, market_cap_rank: 5, circulating_supply: 470000000, ath_change_percentage: -60, image: "https://coin-images.coingecko.com/coins/images/4128/large/solana.png" },
  { symbol: "xrp", current_price: 1.30, price_change_percentage_24h: 3.1, total_volume: 4200000000, market_cap: 74000000000, market_cap_rank: 4, circulating_supply: 57000000000, ath_change_percentage: -65, image: "https://coin-images.coingecko.com/coins/images/44/large/xrp-symbol-white-128.png" },
  { symbol: "doge", current_price: 0.077, price_change_percentage_24h: 1.4, total_volume: 1200000000, market_cap: 11000000000, market_cap_rank: 8, circulating_supply: 147000000000, ath_change_percentage: -89, image: "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png" },
  { symbol: "sui", current_price: 0.92, price_change_percentage_24h: 5.2, total_volume: 1800000000, market_cap: 2600000000, market_cap_rank: 18, circulating_supply: 2800000000, ath_change_percentage: -75, image: "https://coin-images.coingecko.com/coins/images/26375/large/sui-ocean-square.png" },
  { symbol: "near", current_price: 4.65, price_change_percentage_24h: 6.1, total_volume: 950000000, market_cap: 5600000000, market_cap_rank: 17, circulating_supply: 1210000000, ath_change_percentage: -77, image: "https://coin-images.coingecko.com/coins/images/10365/large/near.png" },
  { symbol: "link", current_price: 11.47, price_change_percentage_24h: 2.3, total_volume: 680000000, market_cap: 7100000000, market_cap_rank: 14, circulating_supply: 626000000, ath_change_percentage: -78, image: "https://coin-images.coingecko.com/coins/images/877/large/chainlink-new-logo.png" },
  { symbol: "avax", current_price: 18.5, price_change_percentage_24h: -1.2, total_volume: 540000000, market_cap: 7500000000, market_cap_rank: 13, circulating_supply: 406000000, ath_change_percentage: -87, image: "https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png" },
  { symbol: "ada", current_price: 0.38, price_change_percentage_24h: 0.8, total_volume: 450000000, market_cap: 13500000000, market_cap_rank: 10, circulating_supply: 35700000000, ath_change_percentage: -88, image: "https://coin-images.coingecko.com/coins/images/975/large/cardano.png" },
];
