import { NextResponse } from "next/server";

export const revalidate = 300; // 5 minutes cache

interface AlternativeMeItem {
  value?: string;
  value_classification?: string;
}

interface CoinGeckoGlobalResponse {
  data?: {
    total_volume?: {
      usd?: number;
    };
  };
}

interface Binance24hRow {
  symbol: string;
  quoteVolume: string;
}

async function fetchLiveGlobalVolume24h(): Promise<number> {
  // 1. Try CoinGecko Global Market Data
  try {
    const cgRes = await fetch("https://api.coingecko.com/api/v3/global", {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (cgRes.ok) {
      const cgJson = (await cgRes.json()) as CoinGeckoGlobalResponse;
      const usdVol = cgJson?.data?.total_volume?.usd;
      if (typeof usdVol === "number" && usdVol > 0) {
        return Math.round(usdVol);
      }
    }
  } catch {
    // fallback to Binance live 24h volume
  }

  // 2. Fallback: Live sum of all Binance USDT 24h spot quoteVolumes
  try {
    const binRes = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr", {
      next: { revalidate: 120 },
    });
    if (binRes.ok) {
      const rows = (await binRes.json()) as Binance24hRow[];
      if (Array.isArray(rows)) {
        let totalUsdtVol = 0;
        for (const r of rows) {
          if (r.symbol.endsWith("USDT")) {
            const qv = parseFloat(r.quoteVolume);
            if (Number.isFinite(qv) && qv > 0) totalUsdtVol += qv;
          }
        }
        if (totalUsdtVol > 0) return Math.round(totalUsdtVol);
      }
    }
  } catch {
    // ignore
  }

  return 0;
}

export async function GET() {
  let value = 50;
  let classification = "Nötr";

  const [fngResult, globalVolume] = await Promise.all([
    (async () => {
      try {
        const res = await fetch("https://api.alternative.me/fng/?limit=1", {
          next: { revalidate: 300 },
        });
        if (res.ok) {
          const json = (await res.json()) as { data?: AlternativeMeItem[] };
          return json?.data?.[0] || null;
        }
      } catch (err) {
        console.warn("FNG fetch error:", err);
      }
      return null;
    })(),
    fetchLiveGlobalVolume24h(),
  ]);

  if (fngResult) {
    value = Number(fngResult.value) || 50;
    const trClassMap: Record<string, string> = {
      "Extreme Fear": "Aşırı Korku",
      Fear: "Korku",
      Neutral: "Nötr",
      Greed: "Açgözlülük",
      "Extreme Greed": "Aşırı Açgözlülük",
    };
    classification =
      trClassMap[fngResult.value_classification || ""] ||
      fngResult.value_classification ||
      "Nötr";
  }

  return NextResponse.json({
    value,
    classification,
    global_volume_24h: globalVolume,
    source: "live",
  });
}
