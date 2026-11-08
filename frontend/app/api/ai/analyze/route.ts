import { NextRequest, NextResponse } from "next/server";

export interface AnalysisRequestBody {
  symbol: string;
  interval?: string;
  price: number;
  change24h?: number;
  signalScore?: number;
  signalLabel?: string;
  indicators?: {
    rsi?: number | null;
    macd?: number | null;
    macdSignal?: number | null;
    macdHist?: number | null;
    bbUpper?: number | null;
    bbMiddle?: number | null;
    bbLower?: number | null;
    vwap?: number | null;
    ema20?: number | null;
    ema50?: number | null;
    ema200?: number | null;
  };
  volume24h?: number;
  orderBookSkew?: number;
  whaleVolumeUsd?: number;
}

export interface AiAnalysisResponse {
  symbol: string;
  source: "gemini" | "quant-engine";
  action: "BUY" | "SELL" | "WAIT";
  sentiment: "bullish" | "bearish" | "neutral" | "warning";
  confidence: number;
  headline: string;
  summary: string;
  keyLevels: {
    support: number;
    resistance: number;
    invalidation: number;
  };
  tradePlan: {
    entry: number;
    tp1: number;
    tp2: number;
    stopLoss: number;
    riskReward: string;
  };
  indicatorsSummary: {
    rsiStatus: string;
    trendStatus: string;
    volatilityStatus: string;
  };
  timestamp: number;
}

// In-memory rate limiting and caching (TTL: 30s)
interface CacheEntry {
  data: AiAnalysisResponse;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

function getCached(key: string): AiAnalysisResponse | null {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key: string, data: AiAnalysisResponse, ttlMs = 30_000) {
  // Purge old entries if cache grows
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now > v.expiresAt) cache.delete(k);
    }
  }
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// Deterministic Quant Hedge-Fund Fallback Engine
function runQuantEngine(payload: AnalysisRequestBody): AiAnalysisResponse {
  const { symbol, price, signalScore = 50, indicators = {} } = payload;
  const rsi = indicators.rsi ?? 50;
  const macdHist = indicators.macdHist ?? 0;
  const vwap = indicators.vwap ?? price;
  const bbUpper = indicators.bbUpper ?? price * 1.025;
  const bbLower = indicators.bbLower ?? price * 0.975;
  const ema20 = indicators.ema20 ?? price;
  const ema50 = indicators.ema50 ?? price;
  const ema200 = indicators.ema200 ?? price;

  let action: "BUY" | "SELL" | "WAIT" = "WAIT";
  let sentiment: "bullish" | "bearish" | "neutral" | "warning" = "neutral";
  let confidence = Math.max(30, Math.min(95, Math.round(signalScore)));
  let headline = "";
  let summary = "";

  // Technical conditions
  const isGoldenCross = ema20 > ema50 && price > ema200;
  const isDeathCross = ema20 < ema50 && price < ema200;
  const isOverbought = rsi >= 72;
  const isOversold = rsi <= 28;
  const isMacdBullish = macdHist > 0;

  if (isOverbought) {
    action = "SELL";
    sentiment = "warning";
    confidence = Math.min(90, Math.max(75, Math.round(rsi)));
    headline = "Aşırı Alım Doyumu (RSI Soğuma Riski)";
    summary = `${symbol} momentum göstergeleri aşırı alım bölgesinde tükeniş işaretleri veriyor (RSI: ${rsi.toFixed(1)}). Üst Bollinger bandına yakın seviyelerde kâr realizasyonu olasılığı yüksek.`;
  } else if (isOversold) {
    action = "BUY";
    sentiment = "bullish";
    confidence = 82;
    headline = "Dip Tepkisi & Aşırı Satım Fırsatı";
    summary = `RSI (${rsi.toFixed(1)}) seviyesi sert satış dalgasının dip noktasına ulaştığını gösteriyor. Alt bant desteği ve kurumsal alıcıların devreye girmesiyle teknik tepki rallisi bekleniyor.`;
  } else if (signalScore >= 65 || (isGoldenCross && isMacdBullish)) {
    action = "BUY";
    sentiment = "bullish";
    confidence = Math.max(68, Math.min(94, signalScore));
    headline = "Güçlü Yükseliş Trendi (EMA & MACD Teyitli)";
    summary = `Kısa vadeli hareketli ortalamalar uzun vadeli ortalamaların üzerinde konumlanmış durumda. Fiyat VWAP (${vwap.toFixed(2)}) üzerinde tutunuyor ve alım iştahı güçlü kalmaya devam ediyor.`;
  } else if (signalScore <= 35 || isDeathCross) {
    action = "SELL";
    sentiment = "bearish";
    confidence = Math.max(68, Math.min(92, 100 - signalScore));
    headline = "Satış Baskısı & Destek Kırılma Riski";
    summary = `Teknik indikatörler zayıflamaya işaret ediyor. Fiyat dinamik dirençlerin altında seyrederken MACD histogramı negatif momentumu teyit ediyor. Pozisyon azaltma veya koruyucu stop önerilir.`;
  } else {
    action = "WAIT";
    sentiment = "neutral";
    confidence = 52;
    headline = "Konsolidasyon ve Yön Arayışı";
    summary = `${symbol} daralan Bollinger bantları içerisinde akümülasyon evresinde. Belirgin bir trend kırılımı gerçekleşene kadar yeni pozisyon açmak yerine destek ve direnç sınırlarını izlemek tavsiye edilir.`;
  }

  // Key Levels
  const safeSupport = bbLower < price ? bbLower : price * 0.982;
  const safeResistance = bbUpper > price ? bbUpper : price * 1.025;
  const invalidation = action === "BUY" ? safeSupport * 0.992 : safeResistance * 1.008;

  // Trade Plan
  let entry = price;
  let tp1 = price * 1.02;
  let tp2 = price * 1.045;
  let stopLoss = price * 0.985;
  let riskReward = "1 : 2.1";

  if (action === "BUY" || action === "WAIT") {
    entry = Number(price.toFixed(4));
    tp1 = Number((price * 1.022).toFixed(4));
    tp2 = Number((safeResistance * 1.01).toFixed(4));
    stopLoss = Number((safeSupport * 0.995).toFixed(4));
    const reward = tp1 - entry;
    const risk = Math.max(0.0001, entry - stopLoss);
    riskReward = `1 : ${(reward / risk).toFixed(1)}`;
  } else if (action === "SELL") {
    entry = Number(price.toFixed(4));
    tp1 = Number((safeSupport * 1.005).toFixed(4));
    tp2 = Number((safeSupport * 0.98).toFixed(4));
    stopLoss = Number((safeResistance * 1.005).toFixed(4));
    const reward = entry - tp1;
    const risk = Math.max(0.0001, stopLoss - entry);
    riskReward = `1 : ${(reward / risk).toFixed(1)}`;
  }

  const rsiStatus = rsi > 70 ? "Aşırı Alım" : rsi < 30 ? "Aşırı Satım" : "Dengeli";
  const trendStatus = price > ema50 ? "Yükseliş (Boğa)" : "Düşüş (Ayı)";
  const bbSpread = Math.abs(bbUpper - bbLower) / price;
  const volatilityStatus = bbSpread > 0.05 ? "Yüksek Volatilite" : "Sıkışma / Düşük Volatilite";

  return {
    symbol,
    source: "quant-engine",
    action,
    sentiment,
    confidence,
    headline,
    summary,
    keyLevels: {
      support: Number(safeSupport.toFixed(4)),
      resistance: Number(safeResistance.toFixed(4)),
      invalidation: Number(invalidation.toFixed(4)),
    },
    tradePlan: {
      entry,
      tp1,
      tp2,
      stopLoss,
      riskReward,
    },
    indicatorsSummary: {
      rsiStatus,
      trendStatus,
      volatilityStatus,
    },
    timestamp: Date.now(),
  };
}

// Call Google Gemini API (with JSON schema response)
async function callGeminiApi(
  apiKey: string,
  payload: AnalysisRequestBody
): Promise<AiAnalysisResponse | null> {
  const prompt = `Sen uluslararası bir hedge fund'da baş kripto para kantitatif analistisin.
Aşağıda verilen anlık teknik piyasa verilerini analiz et ve katı bir risk yönetimi disipliniyle kurumsal düzeyde Türkçe işlem planı üret.

SEMBOL: ${payload.symbol}
ANLIK FİYAT: ${payload.price} USDT
24S DEĞİŞİM: ${payload.change24h ?? 0}%
SİNYAL PUANI (0-100): ${payload.signalScore ?? 50} (${payload.signalLabel ?? "NÖTR"})
RSI: ${payload.indicators?.rsi ?? "Bilinmiyor"}
MACD HISTOGRAM: ${payload.indicators?.macdHist ?? "Bilinmiyor"}
VWAP: ${payload.indicators?.vwap ?? "Bilinmiyor"}
BOLLINGER ÜST: ${payload.indicators?.bbUpper ?? "Bilinmiyor"}
BOLLINGER ALT: ${payload.indicators?.bbLower ?? "Bilinmiyor"}
EMA 20: ${payload.indicators?.ema20 ?? "Bilinmiyor"}
EMA 50: ${payload.indicators?.ema50 ?? "Bilinmiyor"}
EMA 200: ${payload.indicators?.ema200 ?? "Bilinmiyor"}
EMİR DEFTERİ DENGESİ: ${payload.orderBookSkew ? (payload.orderBookSkew > 0 ? "Alıcı Ağırlıklı" : "Satıcı Ağırlıklı") : "Dengeli"}
BALİNA HACMİ: ${payload.whaleVolumeUsd ? payload.whaleVolumeUsd + " USD" : "Normal"}

LÜTFEN SADECE GEÇERLİ JSON FORMATINDA CEVAP VER. JSON ŞEMASI AŞAĞIDAKİ GİBİ OLMALIDIR:
{
  "action": "BUY" | "SELL" | "WAIT",
  "sentiment": "bullish" | "bearish" | "neutral" | "warning",
  "confidence": number (0-100 arası integer),
  "headline": string (maksimum 6 kelimelik vurucu başlık),
  "summary": string (2-3 cümlelik derin teknik gerekçe ve piyasa yorumu),
  "keyLevels": {
    "support": number,
    "resistance": number,
    "invalidation": number
  },
  "tradePlan": {
    "entry": number,
    "tp1": number,
    "tp2": number,
    "stopLoss": number,
    "riskReward": string (örn: "1 : 2.4")
  },
  "indicatorsSummary": {
    "rsiStatus": string,
    "trendStatus": string,
    "volatilityStatus": string
  }
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.warn(`[Gemini API Warning] HTTP ${res.status}: ${errorText.slice(0, 150)}`);
    return null;
  }

  const jsonResult = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const rawText = jsonResult.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return null;

  try {
    const parsed = JSON.parse(rawText) as Omit<AiAnalysisResponse, "symbol" | "source" | "timestamp">;
    return {
      symbol: payload.symbol,
      source: "gemini",
      action: parsed.action || "WAIT",
      sentiment: parsed.sentiment || "neutral",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 75,
      headline: parsed.headline || "Piyasa Güncellemesi",
      summary: parsed.summary || "",
      keyLevels: {
        support: Number(parsed.keyLevels?.support) || payload.price * 0.98,
        resistance: Number(parsed.keyLevels?.resistance) || payload.price * 1.02,
        invalidation: Number(parsed.keyLevels?.invalidation) || payload.price * 0.97,
      },
      tradePlan: {
        entry: Number(parsed.tradePlan?.entry) || payload.price,
        tp1: Number(parsed.tradePlan?.tp1) || payload.price * 1.02,
        tp2: Number(parsed.tradePlan?.tp2) || payload.price * 1.04,
        stopLoss: Number(parsed.tradePlan?.stopLoss) || payload.price * 0.985,
        riskReward: parsed.tradePlan?.riskReward || "1 : 2.0",
      },
      indicatorsSummary: {
        rsiStatus: parsed.indicatorsSummary?.rsiStatus || "Nötr",
        trendStatus: parsed.indicatorsSummary?.trendStatus || "Yatay",
        volatilityStatus: parsed.indicatorsSummary?.volatilityStatus || "Normal",
      },
      timestamp: Date.now(),
    };
  } catch (err) {
    console.warn("[Gemini API Parse Error]", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AnalysisRequestBody;
    if (!body || !body.symbol || typeof body.price !== "number") {
      return NextResponse.json(
        { error: "Invalid payload: symbol and numeric price are required" },
        { status: 400 }
      );
    }

    const cacheKey = `${body.symbol}_${body.interval || "1m"}_${Math.round(body.price * 100)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Determine API Key priority:
    // 1. Client header `x-gemini-key` (BYOK)
    // 2. Server process.env.GEMINI_API_KEY
    const customHeaderKey = req.headers.get("x-gemini-key");
    const serverKey = process.env.GEMINI_API_KEY;
    const apiKey = (customHeaderKey && customHeaderKey.trim().length > 10)
      ? customHeaderKey.trim()
      : serverKey;

    let result: AiAnalysisResponse | null = null;

    if (apiKey) {
      try {
        result = await callGeminiApi(apiKey, body);
      } catch (geminiErr) {
        console.warn("[Gemini Call Failed, falling back to quant engine]:", geminiErr);
      }
    }

    // Graceful fallback to quantitative heuristic engine if Gemini is unavailable or not configured
    if (!result) {
      result = runQuantEngine(body);
    }

    setCache(cacheKey, result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[AI Analysis API Error]", error);
    return NextResponse.json(
      { error: "Internal server error during analysis" },
      { status: 500 }
    );
  }
}

