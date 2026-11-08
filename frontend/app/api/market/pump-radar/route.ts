import { NextRequest, NextResponse } from "next/server";
import {
  buildRadarCoin,
  coinId,
  computeBookMetrics,
  computeBtcShield,
  parseKlines,
  type Candle,
  type CoinMeta,
  type Exchange,
  type RadarCoin,
  type RadarPayload,
} from "@/lib/pumpRadar";

// Sunucuda çalışır: borsa çağrıları istemciye açılmaz, 45 sn memory cache ile rate limit korunur.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CACHE_TTL_MS = 45_000;
const KLINE_LIMIT = 96; // 96 x 15dk = 24 saat
const TOP_PER_EXCHANGE = 60;
const BOOK_TOP_N = 14;
const MIN_LIST_SCORE = 32;
const MAX_LIST = 35;

const BINANCE_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];
const MEXC_HOST = "https://api.mexc.com";
const FUTURES_URLS = [
  "https://fapi.binance.com/fapi/v1/premiumIndex",
  "https://www.binance.com/fapi/v1/premiumIndex",
];

const MIN_VOLUME: Record<Exchange, number> = { BINANCE: 1_000_000, MEXC: 150_000 };

const STABLE_BASES = new Set([
  "USDC", "FDUSD", "TUSD", "USDP", "DAI", "USDE", "EUR", "EURI", "AEUR",
  "USD1", "PYUSD", "BFUSD", "XUSD", "USDS", "USDD", "GUSD", "BUSD",
]);

interface RawTicker {
  symbol: string;
  lastPrice: string;
  openPrice: string;
  quoteVolume: string;
}

interface RawDepth {
  bids?: Array<[string, string]>;
  asks?: Array<[string, string]>;
}

interface RawFunding {
  symbol: string;
  lastFundingRate: string;
}

interface CacheEntry {
  at: number;
  payload: RadarPayload;
  prices: Record<string, number>;
}

let cache: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;

// ── Ağ yardımcıları ───────────────────────────────────────────────────────────

async function fetchJson<T>(urls: string[], timeoutMs = 6000): Promise<T | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 pump-radar" },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (res.ok) return (await res.json()) as T;
    } catch {
      // sıradaki host'u dene
    }
  }
  return null;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Veri toplama ──────────────────────────────────────────────────────────────

function isTradable(symbol: string, exchange: Exchange, volume: number): boolean {
  if (!symbol.endsWith("USDT")) return false;
  const base = symbol.slice(0, -4);
  if (!base || STABLE_BASES.has(base)) return false;
  if (/\d+[LS]$/.test(base) || /(BULL|BEAR)$/.test(base)) return false; // kaldıraçlı tokenlar
  return volume >= MIN_VOLUME[exchange];
}

function toMetas(
  tickers: RawTicker[] | null,
  exchange: Exchange,
  prioritySymbols?: ReadonlySet<string>
): CoinMeta[] {
  if (!tickers) return [];
  const metas: CoinMeta[] = [];
  for (const t of tickers) {
    const price = Number(t.lastPrice);
    const open = Number(t.openPrice);
    const volume = Number(t.quoteVolume);
    if (!(price > 0) || !Number.isFinite(volume)) continue;
    if (!isTradable(t.symbol, exchange, volume)) continue;
    const change24h = open > 0 ? (price / open - 1) * 100 : 0;
    if (price > 0.97 && price < 1.03 && Math.abs(change24h) < 0.5) continue;
    metas.push({ symbol: t.symbol, exchange, price, change24h, volume24hUsd: volume });
  }
  const sorted = metas.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
  const top = sorted.slice(0, TOP_PER_EXCHANGE);
  if (prioritySymbols && prioritySymbols.size > 0) {
    const topSet = new Set(top.map((m) => m.symbol));
    for (const m of sorted.slice(TOP_PER_EXCHANGE)) {
      if (prioritySymbols.has(m.symbol) && !topSet.has(m.symbol)) {
        top.push(m);
        if (top.length >= TOP_PER_EXCHANGE + 10) break;
      }
    }
  }
  return top;
}

async function loadCandles(meta: CoinMeta) {
  const urls =
    meta.exchange === "BINANCE"
      ? BINANCE_HOSTS.map((h) => `${h}/api/v3/klines?symbol=${meta.symbol}&interval=15m&limit=${KLINE_LIMIT}`)
      : [`${MEXC_HOST}/api/v3/klines?symbol=${meta.symbol}&interval=15m&limit=${KLINE_LIMIT}`];
  const raw = await fetchJson<unknown>(urls, 7000);
  return parseKlines(raw, meta.exchange === "BINANCE");
}

async function loadBookInfo(meta: CoinMeta): Promise<{ bookRatio: number | null; askWallPrice: number | null }> {
  const urls =
    meta.exchange === "BINANCE"
      ? BINANCE_HOSTS.map((h) => `${h}/api/v3/depth?symbol=${meta.symbol}&limit=100`)
      : [`${MEXC_HOST}/api/v3/depth?symbol=${meta.symbol}&limit=100`];
  const depth = await fetchJson<RawDepth>(urls, 5000);
  if (!depth?.bids || !depth.asks) return { bookRatio: null, askWallPrice: null };
  return computeBookMetrics(depth.bids, depth.asks, meta.price);
}

async function buildSnapshot(): Promise<CacheEntry> {
  const [binanceRaw, mexcRaw, fundingRaw] = await Promise.all([
    fetchJson<RawTicker[]>(BINANCE_HOSTS.map((h) => `${h}/api/v3/ticker/24hr`), 8000),
    fetchJson<RawTicker[]>([`${MEXC_HOST}/api/v3/ticker/24hr`], 8000),
    fetchJson<RawFunding[]>(FUTURES_URLS, 5000),
  ]);

  const fundingMap = new Map<string, number>();
  const negFundingPriority = new Set<string>(["BTCUSDT"]);
  if (fundingRaw) {
    for (const f of fundingRaw) {
      const rate = Number(f.lastFundingRate);
      if (Number.isFinite(rate)) {
        fundingMap.set(f.symbol, rate);
        if (rate <= -0.00015) negFundingPriority.add(f.symbol);
      }
    }
  }

  const binanceMetas = toMetas(binanceRaw, "BINANCE", negFundingPriority);
  const binanceSymbols = new Set(binanceMetas.map((m) => m.symbol));
  const mexcMetas = toMetas(mexcRaw, "MEXC").filter((m) => !binanceSymbols.has(m.symbol));
  const metas = [...binanceMetas, ...mexcMetas];

  // Takip için tüm güncel fiyatlar (listede olmayan coinler dahil)
  const prices: Record<string, number> = {};
  for (const [raw, ex] of [[binanceRaw, "BINANCE"], [mexcRaw, "MEXC"]] as const) {
    if (!raw) continue;
    for (const t of raw) {
      const p = Number(t.lastPrice);
      if (p > 0 && t.symbol.endsWith("USDT")) prices[coinId(ex, t.symbol)] = p;
    }
  }

  // 1. geçiş: mumlar + ön skor
  const prelim = await mapPool(metas, 12, async (meta) => {
    const candles = await loadCandles(meta);
    return {
      meta,
      candles,
      coin: buildRadarCoin(meta, candles, { funding: fundingMap.get(meta.symbol) ?? null }),
    };
  });

  // BTC Tehlike Kalkanı hesapla
  const btcEntry = prelim.find((p) => p.meta.symbol === "BTCUSDT");
  const btcShield = btcEntry ? computeBtcShield(btcEntry.meta, btcEntry.candles) : null;

  const valid = prelim.filter(
    (p): p is { meta: CoinMeta; candles: Candle[]; coin: RadarCoin } => p.coin !== null
  );

  // 2. geçiş: en iyi adaylar için emir defteri + satış duvarı (Ask Wall) analizi
  const top = [...valid]
    .filter((p) => !p.coin.late)
    .sort((a, b) => b.coin.score - a.coin.score)
    .slice(0, BOOK_TOP_N);

  const refined = new Map<string, RadarCoin>();
  await mapPool(top, 6, async (p) => {
    const { bookRatio, askWallPrice } = await loadBookInfo(p.meta);
    const coin = buildRadarCoin(p.meta, p.candles, {
      bookRatio,
      askWallPrice,
      funding: fundingMap.get(p.meta.symbol) ?? null,
    });
    if (coin) refined.set(coin.id, coin);
  });

  const all = valid.map((p) => refined.get(p.coin.id) ?? p.coin);
  const lateCount = all.filter((c) => c.late).length;
  const trapCount = all.filter((c) => !c.late && c.isBullTrap).length;
  const coins = all
    .filter((c) => !c.late && (c.score >= MIN_LIST_SCORE || c.isShortSqueeze || c.isMicroBurst || c.isBullTrap))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_LIST);

  const payload: RadarPayload = {
    generatedAt: Date.now(),
    scanned: all.length,
    lateCount,
    trapCount,
    coins,
    prices: {},
    sources: {
      binance: binanceRaw !== null,
      mexc: mexcRaw !== null,
      futures: fundingRaw !== null,
    },
    btcShield,
  };
  return { at: Date.now(), payload, prices };
}

async function getSnapshot(): Promise<CacheEntry> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  if (!inflight) {
    inflight = buildSnapshot()
      .then((entry) => {
        if (!entry.payload.sources.binance && !entry.payload.sources.mexc && cache) return cache;
        cache = entry;
        return entry;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export async function GET(req: NextRequest) {
  try {
    const entry = await getSnapshot();
    const track = (req.nextUrl.searchParams.get("track") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100);

    const prices: Record<string, number> = {};
    for (const id of track) {
      const p = entry.prices[id];
      if (p) prices[id] = p;
    }

    const body: RadarPayload = { ...entry.payload, prices };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[pump-radar] error", err);
    if (cache) {
      return NextResponse.json({ ...cache.payload, prices: {} } satisfies RadarPayload);
    }
    return NextResponse.json({ error: "Radar verisi alınamadı" }, { status: 502 });
  }
}
