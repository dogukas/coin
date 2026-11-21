import { NextResponse } from "next/server";

export interface FuturesIntelPayload {
  available: boolean;
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRatePct: number; // e.g. 0.0100 means +0.01%
  nextFundingTime: number;
  openInterestCoins: number;
  openInterestUsd: number;
  oiChange15mPct: number;
  whaleLongPct: number;
  whaleShortPct: number;
  whaleRatio: number;
  retailLongPct: number;
  retailShortPct: number;
  verdictLabel: string;
  verdictTone: "BULL" | "BEAR" | "NEUTRAL" | "SQUEEZE";
  updatedAt: number;
}

interface CacheEntry {
  data: FuturesIntelPayload;
  expiresAt: number;
}

const futuresCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 20_000; // 20s memory TTL per CSO standard

interface PremiumIndexResp {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
}

interface OpenInterestResp {
  openInterest: string;
  symbol: string;
}

interface OpenInterestHistItem {
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  timestamp: number;
}

interface LongShortRatioItem {
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  timestamp: number;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await context.params;
  const cleanSymbol = (symbol || "BTCUSDT").toUpperCase().replace(/[^A-Z0-9]/g, "");

  const now = Date.now();
  const cached = futuresCache.get(cleanSymbol);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.data);
  }

  try {
    const base = "https://fapi.binance.com";
    const [premRes, oiRes, oiHistRes, topLsRes, globalLsRes] = await Promise.all([
      fetch(`${base}/fapi/v1/premiumIndex?symbol=${cleanSymbol}`, {
        next: { revalidate: 15 },
      }),
      fetch(`${base}/fapi/v1/openInterest?symbol=${cleanSymbol}`, {
        next: { revalidate: 15 },
      }),
      fetch(`${base}/futures/data/openInterestHist?symbol=${cleanSymbol}&period=5m&limit=4`, {
        next: { revalidate: 20 },
      }),
      fetch(
        `${base}/futures/data/topLongShortPositionRatio?symbol=${cleanSymbol}&period=5m&limit=1`,
        { next: { revalidate: 20 } }
      ),
      fetch(
        `${base}/futures/data/globalLongShortAccountRatio?symbol=${cleanSymbol}&period=5m&limit=1`,
        { next: { revalidate: 20 } }
      ),
    ]);

    if (!premRes.ok || !oiRes.ok) {
      const unavailable: FuturesIntelPayload = {
        available: false,
        symbol: cleanSymbol,
        markPrice: 0,
        indexPrice: 0,
        fundingRatePct: 0,
        nextFundingTime: 0,
        openInterestCoins: 0,
        openInterestUsd: 0,
        oiChange15mPct: 0,
        whaleLongPct: 50,
        whaleShortPct: 50,
        whaleRatio: 1,
        retailLongPct: 50,
        retailShortPct: 50,
        verdictLabel: "Sadece Spot Piyasa",
        verdictTone: "NEUTRAL",
        updatedAt: now,
      };
      futuresCache.set(cleanSymbol, { data: unavailable, expiresAt: now + 60_000 });
      return NextResponse.json(unavailable);
    }

    const prem = (await premRes.json()) as PremiumIndexResp;
    const oi = (await oiRes.json()) as OpenInterestResp;
    const oiHist = oiHistRes.ok ? ((await oiHistRes.json()) as OpenInterestHistItem[]) : [];
    const topLs = topLsRes.ok ? ((await topLsRes.json()) as LongShortRatioItem[]) : [];
    const globalLs = globalLsRes.ok ? ((await globalLsRes.json()) as LongShortRatioItem[]) : [];

    const markPrice = parseFloat(prem.markPrice) || 0;
    const indexPrice = parseFloat(prem.indexPrice) || 0;
    const fundingRatePct = (parseFloat(prem.lastFundingRate) || 0) * 100;
    const openInterestCoins = parseFloat(oi.openInterest) || 0;
    const openInterestUsd = openInterestCoins * markPrice;

    let oiChange15mPct = 0;
    if (Array.isArray(oiHist) && oiHist.length >= 2) {
      const oldest = parseFloat(oiHist[0].sumOpenInterestValue) || 0;
      const latest = parseFloat(oiHist[oiHist.length - 1].sumOpenInterestValue) || 0;
      if (oldest > 0) {
        oiChange15mPct = ((latest - oldest) / oldest) * 100;
      }
    }

    let whaleLongPct = 50;
    let whaleShortPct = 50;
    let whaleRatio = 1;
    if (Array.isArray(topLs) && topLs.length > 0) {
      whaleLongPct = (parseFloat(topLs[0].longAccount) || 0.5) * 100;
      whaleShortPct = (parseFloat(topLs[0].shortAccount) || 0.5) * 100;
      whaleRatio = parseFloat(topLs[0].longShortRatio) || 1;
    }

    let retailLongPct = 50;
    let retailShortPct = 50;
    if (Array.isArray(globalLs) && globalLs.length > 0) {
      retailLongPct = (parseFloat(globalLs[0].longAccount) || 0.5) * 100;
      retailShortPct = (parseFloat(globalLs[0].shortAccount) || 0.5) * 100;
    }

    // Smart Futures Verdict Logic
    let verdictLabel = "Vadeli Dengeli Akış";
    let verdictTone: FuturesIntelPayload["verdictTone"] = "NEUTRAL";

    if (fundingRatePct < -0.005 && whaleLongPct >= 52) {
      verdictLabel = "🔥 Short Squeeze Adayı (Negatif Fonlama + Balina Long)";
      verdictTone = "SQUEEZE";
    } else if (whaleLongPct >= 55 && oiChange15mPct >= 0.3) {
      verdictLabel = "🐋 Balina Long + Yeni Para Girişi (Güçlü Boğa)";
      verdictTone = "BULL";
    } else if (whaleLongPct >= 54 && retailLongPct < 48) {
      verdictLabel = "🐋 Balinalar Long Topluyor (Bireysel Shortta)";
      verdictTone = "BULL";
    } else if (whaleShortPct >= 55 && oiChange15mPct >= 0.3) {
      verdictLabel = "🩸 Balina Short Açıyor (Yeni Short Girişi)";
      verdictTone = "BEAR";
    } else if (fundingRatePct > 0.035 && retailLongPct > 65) {
      verdictLabel = "⚠️ Aşırı Kalabalık Long (Long Squeeze Riski)";
      verdictTone = "BEAR";
    } else if (whaleLongPct >= 52) {
      verdictLabel = "📈 Balina Pozisyonları Long Ağırlıklı";
      verdictTone = "BULL";
    } else if (whaleShortPct >= 52) {
      verdictLabel = "📉 Balina Pozisyonları Short Ağırlıklı";
      verdictTone = "BEAR";
    }

    const payload: FuturesIntelPayload = {
      available: true,
      symbol: cleanSymbol,
      markPrice,
      indexPrice,
      fundingRatePct,
      nextFundingTime: prem.nextFundingTime || 0,
      openInterestCoins,
      openInterestUsd,
      oiChange15mPct,
      whaleLongPct,
      whaleShortPct,
      whaleRatio,
      retailLongPct,
      retailShortPct,
      verdictLabel,
      verdictTone,
      updatedAt: now,
    };

    futuresCache.set(cleanSymbol, { data: payload, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      {
        available: false,
        symbol: cleanSymbol,
        markPrice: 0,
        indexPrice: 0,
        fundingRatePct: 0,
        nextFundingTime: 0,
        openInterestCoins: 0,
        openInterestUsd: 0,
        oiChange15mPct: 0,
        whaleLongPct: 50,
        whaleShortPct: 50,
        whaleRatio: 1,
        retailLongPct: 50,
        retailShortPct: 50,
        verdictLabel: "Vadeli Veri Bekleniyor",
        verdictTone: "NEUTRAL",
        updatedAt: now,
      } satisfies FuturesIntelPayload,
      { status: 200 }
    );
  }
}
