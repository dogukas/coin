import { NextResponse } from "next/server";

export const revalidate = 60; // Cache for 60 seconds

interface CoinGeckoRawMarketCoin {
  symbol?: string;
  current_price?: number;
  price_change_percentage_24h?: number;
  total_volume?: number;
  image?: string;
  market_cap?: number;
  market_cap_rank?: number;
  circulating_supply?: number;
  ath_change_percentage?: number;
  sparkline_in_7d?: {
    price?: number[];
  };
}

interface Binance24hRow {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
  weightedAvgPrice: string;
}

const EXCLUDED_BASES = new Set([
  "USDT",
  "USDC",
  "FDUSD",
  "TUSD",
  "USDP",
  "DAI",
  "BUSD",
  "USDE",
  "EUR",
  "GBP",
  "WBTC",
  "STETH",
  "WSTETH",
]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = parseInt(searchParams.get("limit") || "60", 10);
    const limit = Math.min(100, Math.max(10, limitParam));

    const cgUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=true`;

    const [cgItems, binanceRows] = await Promise.all([
      (async (): Promise<CoinGeckoRawMarketCoin[]> => {
        try {
          const res = await fetch(cgUrl, {
            headers: {
              Accept: "application/json",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            next: { revalidate: 60 },
          });
          if (res.ok) {
            const d = (await res.json()) as CoinGeckoRawMarketCoin[];
            if (Array.isArray(d)) return d;
          }
        } catch {
          // fallback to Binance live tickers below
        }
        return [];
      })(),
      (async (): Promise<Binance24hRow[]> => {
        try {
          const res = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr", {
            next: { revalidate: 30 },
          });
          if (res.ok) {
            const d = (await res.json()) as Binance24hRow[];
            if (Array.isArray(d)) return d;
          }
        } catch {
          // ignore
        }
        return [];
      })(),
    ]);

    const binanceMap = new Map<string, Binance24hRow>();
    for (const r of binanceRows) {
      if (r.symbol.endsWith("USDT")) {
        binanceMap.set(r.symbol, r);
      }
    }

    // If CoinGecko succeeded, merge live Binance prices & intraday metrics;
    // If CoinGecko rate-limited, build directly from top live Binance USDT tickers (zero fake prices!)
    const sourceList: CoinGeckoRawMarketCoin[] =
      cgItems.length > 0
        ? cgItems.filter((c) => !EXCLUDED_BASES.has((c.symbol || "").toUpperCase()))
        : binanceRows
            .filter((r) => {
              if (!r.symbol.endsWith("USDT")) return false;
              const base = r.symbol.slice(0, -4);
              return !EXCLUDED_BASES.has(base) && parseFloat(r.quoteVolume) >= 2_000_000;
            })
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, limit)
            .map((r, idx) => ({
              symbol: r.symbol.slice(0, -4).toLowerCase(),
              current_price: parseFloat(r.lastPrice),
              price_change_percentage_24h: parseFloat(r.priceChangePercent),
              total_volume: parseFloat(r.quoteVolume),
              image: "",
              market_cap: 0,
              market_cap_rank: idx + 1,
              circulating_supply: 0,
              ath_change_percentage: 0,
              sparkline_in_7d: { price: [] },
            }));

    const enriched = sourceList.slice(0, limit).map((coin, idx) => {
      const rawSymbol = (coin.symbol || "").toUpperCase();
      const symbol = rawSymbol.endsWith("USDT") ? rawSymbol : `${rawSymbol}USDT`;
      const binTicker = binanceMap.get(symbol);

      // Prefer live Binance spot price and 24h change when available
      const price = binTicker
        ? parseFloat(binTicker.lastPrice) || Number(coin.current_price) || 0
        : Number(coin.current_price) || 0;
      const change24h = binTicker
        ? parseFloat(binTicker.priceChangePercent) || Number(coin.price_change_percentage_24h) || 0
        : Number(coin.price_change_percentage_24h) || 0;
      const volumeUsd = binTicker
        ? Math.max(parseFloat(binTicker.quoteVolume) || 0, Number(coin.total_volume) || 0)
        : Number(coin.total_volume) || 0;

      const sparklinePrices: number[] = Array.isArray(coin.sparkline_in_7d?.price)
        ? coin.sparkline_in_7d.price
        : [];

      const sparkline =
        sparklinePrices.length >= 10
          ? sparklinePrices.slice(-24)
          : binTicker
          ? [
              parseFloat(binTicker.lowPrice) || price,
              parseFloat(binTicker.weightedAvgPrice) || price,
              parseFloat(binTicker.highPrice) || price,
              price,
            ]
          : [price];

      const rsi = calculateWilderRSI(sparklinePrices, 14);
      const macdTrend = calculateRealMACDTrend(sparklinePrices, price, binTicker);

      // Real intraday buying support from 24h High/Low/VWAP position
      let buyPressure = 50;
      if (binTicker) {
        const high = parseFloat(binTicker.highPrice);
        const low = parseFloat(binTicker.lowPrice);
        const vwap = parseFloat(binTicker.weightedAvgPrice);
        if (high > low && price > 0) {
          const rangePos = (price - low) / (high - low); // 0..1
          const vwapRatio = vwap > 0 ? (price - vwap) / vwap : 0;
          buyPressure = Math.round(
            Math.min(88, Math.max(15, rangePos * 70 + 15 + vwapRatio * 120))
          );
        }
      } else if (sparklinePrices.length >= 6) {
        const recent = sparklinePrices.slice(-12);
        const minP = Math.min(...recent);
        const maxP = Math.max(...recent);
        if (maxP > minP) {
          buyPressure = Math.round(
            Math.min(85, Math.max(18, ((price - minP) / (maxP - minP)) * 70 + 15))
          );
        }
      }

      // Technical Score
      let score = 50;
      if (buyPressure >= 58) score += 14;
      else if (buyPressure <= 42) score -= 12;

      if (rsi !== null) {
        if (rsi >= 45 && rsi <= 65) score += 14;
        else if (rsi < 34) score += 12;
        else if (rsi > 74) score -= 12;
      }

      if (macdTrend === "bullish") score += 14;
      else if (macdTrend === "bearish") score -= 12;

      if (change24h > 1.5 && change24h < 18) score += 8;
      else if (change24h < -3) score -= 8;

      score = Math.max(10, Math.min(95, Math.round(score)));

      let signalLevel = "BEKLE / NÖTR";
      if (score >= 65) signalLevel = "GÜÇLÜ AL SİNYALİ";
      else if (score >= 52) signalLevel = "AL SİNYALİ";
      else if (score <= 38) signalLevel = "SAT / ZAYIF";

      return {
        symbol,
        price,
        change_24h: Number(change24h.toFixed(2)),
        volume_usd: Math.round(volumeUsd),
        signal_score: score,
        signal_level: signalLevel,
        rsi_14: rsi,
        macd_trend: macdTrend,
        buy_pressure_pct: buyPressure,
        sparkline,
        logo: coin.image || "",
        market_cap: Number(coin.market_cap) || 0,
        market_cap_rank: Number(coin.market_cap_rank) || idx + 1,
        circulating_supply: Number(coin.circulating_supply) || 0,
        ath_change_pct: Number(coin.ath_change_percentage?.toFixed(2)) || 0,
      };
    });

    enriched.sort((a, b) => a.market_cap_rank - b.market_cap_rank);
    return NextResponse.json(enriched);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function calculateWilderRSI(prices: number[], period = 14): number | null {
  if (!prices || prices.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(1));
}

function calculateRealMACDTrend(
  prices: number[],
  currentPrice: number,
  binTicker?: Binance24hRow
): "bullish" | "bearish" | null {
  if (prices && prices.length >= 26) {
    const k12 = 2 / 13;
    const k26 = 2 / 27;
    let ema12 = prices[0];
    let ema26 = prices[0];
    for (let i = 1; i < prices.length; i++) {
      ema12 = prices[i] * k12 + ema12 * (1 - k12);
      ema26 = prices[i] * k26 + ema26 * (1 - k26);
    }
    return ema12 >= ema26 ? "bullish" : "bearish";
  }
  if (binTicker) {
    const vwap = parseFloat(binTicker.weightedAvgPrice);
    if (vwap > 0) return currentPrice >= vwap ? "bullish" : "bearish";
  }
  return null;
}
