// Pump Radar — saf (side-effect'siz) skorlama motoru.
// Hem sunucu route'u hem de istemci tarafından paylaşılan tipleri ve hesaplamaları içerir.
// Amaç: pump BAŞLAMADAN önceki birikim izlerini (hacim, sıkışma, alıcı baskısı, emir defteri)
// tek bir 0-100 skora indirmek ve "çok geç kalmış" coinleri elemek.

export type Exchange = "BINANCE" | "MEXC";

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Quote (USDT) hacmi */
  qv: number;
  /** Sadece Binance: agresif alıcıların USDT hacmi */
  takerBuyQv: number | null;
}

export interface CoinMeta {
  symbol: string;
  exchange: Exchange;
  price: number;
  change24h: number;
  volume24hUsd: number;
}

export interface RadarExtras {
  /** Emir defteri ±%2 bid/ask değer oranı */
  bookRatio?: number | null;
  /** Binance vadeli funding oranı (ör. 0.0001 = %0.01) */
  funding?: number | null;
}

export interface ScoreBreakdown {
  volume: number;
  early: number;
  squeeze: number;
  buy: number;
  book: number;
  funding: number;
}

export interface TradePlan {
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  /** Girişe göre stop mesafesi (%) */
  riskPct: number;
}

export interface RadarCoin {
  id: string;
  symbol: string;
  exchange: Exchange;
  price: number;
  change1h: number;
  change4h: number;
  change24h: number;
  volume24hUsd: number;
  /** Son 1 saatlik hacim / normal 1 saatlik hacim */
  volSpike: number;
  /** Bollinger bant genişliği persentili (düşük = sıkışık). null = hesaplanamadı */
  squeezePct: number | null;
  /** 0-1 arası alıcı payı */
  buyShare: number | null;
  buyShareSource: "taker" | "candle";
  bookRatio: number | null;
  funding: number | null;
  score: number;
  breakdown: ScoreBreakdown;
  reasons: string[];
  risks: string[];
  plan: TradePlan;
  /** true ise pump büyük ölçüde gerçekleşmiş — listeden elenir */
  late: boolean;
}

export interface RadarPayload {
  generatedAt: number;
  scanned: number;
  lateCount: number;
  coins: RadarCoin[];
  /** İstenen takip id'leri için güncel fiyatlar */
  prices: Record<string, number>;
  sources: { binance: boolean; mexc: boolean; futures: boolean };
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

export function coinId(exchange: Exchange, symbol: string): string {
  return `${exchange}:${symbol}`;
}

type RawKlineRow = ReadonlyArray<string | number>;

export function parseKlines(raw: unknown, binance: boolean): Candle[] {
  if (!Array.isArray(raw)) return [];
  const out: Candle[] = [];
  for (const row of raw as unknown[]) {
    if (!Array.isArray(row) || row.length < 8) continue;
    const r = row as RawKlineRow;
    const candle: Candle = {
      t: Number(r[0]),
      o: Number(r[1]),
      h: Number(r[2]),
      l: Number(r[3]),
      c: Number(r[4]),
      qv: Number(r[7]),
      takerBuyQv: binance && r.length > 10 ? Number(r[10]) : null,
    };
    if ([candle.o, candle.h, candle.l, candle.c, candle.qv].some((v) => !Number.isFinite(v))) continue;
    out.push(candle);
  }
  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** 20 periyotluk Bollinger bant genişliği serisi: (4 * std) / sma */
function bandwidthSeries(closes: number[], period = 20): number[] {
  const out: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const win = closes.slice(i - period + 1, i + 1);
    const mean = win.reduce((a, b) => a + b, 0) / period;
    if (mean <= 0) continue;
    const variance = win.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    out.push((4 * Math.sqrt(variance)) / mean);
  }
  return out;
}

const WINDOW = 4; // 4 x 15dk = 1 saat

// ── Ana skorlama ──────────────────────────────────────────────────────────────

export function buildRadarCoin(meta: CoinMeta, candles: Candle[], extras: RadarExtras = {}): RadarCoin | null {
  const n = candles.length;
  if (n < 40 || meta.price <= 0) return null;

  const last = candles[n - 1];
  const price = meta.price > 0 ? meta.price : last.c;

  // Fiyat değişimleri
  const change1h = (last.c / candles[n - WINDOW].o - 1) * 100;
  const change4h = (last.c / candles[n - 16].o - 1) * 100;

  // Hacim sıçraması: son 1 saat vs. önceki 1 saatlik pencerelerin MEDYANI (eski spike'lardan etkilenmez)
  const recentQv = candles.slice(n - WINDOW).reduce((a, c) => a + c.qv, 0);
  const windows: number[] = [];
  for (let end = n - WINDOW; end - WINDOW >= 0; end -= WINDOW) {
    windows.push(candles.slice(end - WINDOW, end).reduce((a, c) => a + c.qv, 0));
  }
  const baseQvRaw = median(windows);
  // Tabanı 24s ortalama saatlik hacmin %25'inden aşağı çekme: illikit coinlerde oran şişmesin (örn. 1000x)
  const baseQv = Math.max(baseQvRaw, (meta.volume24hUsd / 24) * 0.25);
  const volSpike = baseQv > 0 ? Math.min(recentQv / baseQv, 50) : 0;

  // Sıkışma: pencereden 4 mum önceki bant genişliği, tüm seriye göre kaçıncı persentilde?
  const bw = bandwidthSeries(candles.map((c) => c.c));
  let squeezePct: number | null = null;
  if (bw.length >= 30) {
    const ref = bw[bw.length - 1 - WINDOW];
    squeezePct = (bw.filter((v) => v < ref).length / bw.length) * 100;
  }

  // Alıcı payı
  const recent = candles.slice(n - WINDOW);
  let buyShare: number | null = null;
  let buyShareSource: "taker" | "candle" = "candle";
  if (recent.every((c) => c.takerBuyQv !== null) && recentQv > 0) {
    buyShare = recent.reduce((a, c) => a + (c.takerBuyQv ?? 0), 0) / recentQv;
    buyShareSource = "taker";
  } else if (recentQv > 0) {
    buyShare = recent.filter((c) => c.c >= c.o).reduce((a, c) => a + c.qv, 0) / recentQv;
  }

  const late = change1h > 8 || change4h > 15 || meta.change24h > 30;

  // ── Puanlar ──
  // Mutlak taban: 1 saatte < $15K işlem hacmi gürültüdür, spike sayılmaz
  let volume =
    volSpike < 1.5 || recentQv < 15_000 ? 0 : 8 + clamp((volSpike - 1.5) / 3.5, 0, 1) * 27; // max 35
  // Hacim ağırlıklı olarak SATIŞTAN geliyorsa bu birikim değil dağıtımdır → hacim puanını yarıya indir
  const sellDominated = buyShare !== null && buyShare < 0.45;
  if (sellDominated) volume *= 0.5;

  let early = 0; // max 20 — hacim var ama fiyat henüz oynamamış = en iyi
  if (change1h <= -1) early = 0;
  else if (change1h < 0.3) early = 10;
  else if (change1h < 2.5) early = 20;
  else if (change1h < 5) early = 12;
  else if (change1h < 8) early = 5;

  let squeeze = 0; // max 15
  if (squeezePct !== null) {
    if (squeezePct <= 15) squeeze = 15;
    else if (squeezePct <= 30) squeeze = 10;
    else if (squeezePct <= 50) squeeze = 4;
  }

  // Hacim yoksa "erken" ve "sıkışma" tek başına sinyal değildir (ölü coin filtresi)
  const noVolumeFactor = volume > 0 ? 1 : 0.4;
  early *= noVolumeFactor;
  squeeze *= volume > 0 ? 1 : 0.5;

  let buy = 0; // max 15 (mum bazlı tahmin daha güvenilmez → x0.7)
  if (buyShare !== null) {
    if (buyShare >= 0.62) buy = 15;
    else if (buyShare >= 0.56) buy = 10;
    else if (buyShare >= 0.52) buy = 4;
    if (buyShareSource === "candle") buy *= 0.7;
  }

  let book = 0; // max 10
  const bookRatio = extras.bookRatio ?? null;
  if (bookRatio !== null) {
    if (bookRatio >= 2.5) book = 10;
    else if (bookRatio >= 1.8) book = 7;
    else if (bookRatio >= 1.3) book = 3;
  }

  let funding = 0; // max 5
  const fundingRate = extras.funding ?? null;
  if (fundingRate !== null) {
    if (fundingRate < 0) funding = 5;
    else if (fundingRate <= 0.00005) funding = 2;
  }

  // 24s zaten çok yükselmişse puan kır
  const latePenalty = meta.change24h > 25 ? 15 : meta.change24h > 15 ? 6 : 0;
  // Satış duvarı alış duvarının >1.7 katıysa (oran < 0.6) yukarı yönlü baskı zayıf
  const bookPenalty = bookRatio !== null && bookRatio < 0.6 ? 6 : 0;

  const total = clamp(
    Math.round(volume + early + squeeze + buy + book + funding - latePenalty - bookPenalty),
    0,
    100
  );

  // ── Gerekçeler & riskler ──
  const reasons: string[] = [];
  if (volume > 0) {
    reasons.push(`Hacim normalin ${volSpike.toFixed(1)}x katı (son 1 saat)`);
  }
  if (volume > 0 && change1h < 2.5 && change1h >= 0) {
    reasons.push(`Fiyat henüz sadece +${change1h.toFixed(2)}% — erken evre`);
  }
  if (squeezePct !== null && squeeze > 0) {
    reasons.push(`Bollinger sıkışması (en dar %${Math.max(1, Math.round(squeezePct))}'lik dilim)`);
  }
  if (buyShare !== null && buy > 0) {
    reasons.push(
      buyShareSource === "taker"
        ? `Agresif alıcı payı %${Math.round(buyShare * 100)}`
        : `Hacmin %${Math.round(buyShare * 100)}'i yeşil mumlarda`
    );
  }
  if (bookRatio !== null && book > 0) {
    reasons.push(`Alış duvarı satışın ${bookRatio.toFixed(1)}x katı (±%2 derinlik)`);
  }
  if (fundingRate !== null && funding > 0) {
    reasons.push(`Funding ${(fundingRate * 100).toFixed(4)}% — short kalabalık / nötr`);
  }

  const risks: string[] = [];
  if (sellDominated) {
    risks.push(`Hacmin çoğu satıştan geliyor (alıcı payı %${Math.round((buyShare ?? 0) * 100)}) — birikim değil dağıtım olabilir`);
  }
  if (bookPenalty > 0) {
    risks.push("Emir defterinde satış duvarı baskın");
  }
  if (meta.volume24hUsd < 1_000_000) {
    risks.push("Düşük likidite — slipaj ve manipülasyon riski yüksek");
  }
  if (meta.exchange === "MEXC") {
    risks.push("MEXC küçük coin — stop emri kayabilir, pozisyonu küçük tut");
  }
  if (meta.change24h > 15) {
    risks.push(`24 saatte zaten %${meta.change24h.toFixed(1)} yükselmiş`);
  }
  if (fundingRate !== null && fundingRate > 0.0003) {
    risks.push("Funding yüksek — long'lar kalabalık, geri çekilme riski");
  }
  if (late) {
    risks.push("Pump büyük ölçüde gerçekleşmiş — geç kalındı");
  }

  // ── İşlem planı: stop = son 12 mumun dibi (%2-%5 bandında), TP = 2R ve 3.5R ──
  const swingLow = Math.min(...candles.slice(n - 12).map((c) => c.l));
  const stopPct = clamp((price - swingLow) / price + 0.003, 0.02, 0.05);
  const plan: TradePlan = {
    entry: price,
    stop: price * (1 - stopPct),
    tp1: price * (1 + stopPct * 2),
    tp2: price * (1 + stopPct * 3.5),
    riskPct: stopPct * 100,
  };

  return {
    id: coinId(meta.exchange, meta.symbol),
    symbol: meta.symbol,
    exchange: meta.exchange,
    price,
    change1h,
    change4h,
    change24h: meta.change24h,
    volume24hUsd: meta.volume24hUsd,
    volSpike,
    squeezePct,
    buyShare,
    buyShareSource,
    bookRatio,
    funding: fundingRate,
    score: total,
    breakdown: {
      volume: Math.round(volume),
      early: Math.round(early),
      squeeze: Math.round(squeeze),
      buy: Math.round(buy),
      book: Math.round(book),
      funding: Math.round(funding),
    },
    reasons,
    risks,
    plan,
    late,
  };
}

/** Emir defteri: fiyatın ±%2'si içindeki bid değeri / ask değeri */
export function computeBookRatio(
  bids: ReadonlyArray<readonly [string, string]>,
  asks: ReadonlyArray<readonly [string, string]>,
  price: number
): number | null {
  if (price <= 0) return null;
  let bidValue = 0;
  let askValue = 0;
  for (const [p, q] of bids) {
    const pr = Number(p);
    if (pr >= price * 0.98) bidValue += pr * Number(q);
  }
  for (const [p, q] of asks) {
    const pr = Number(p);
    if (pr <= price * 1.02) askValue += pr * Number(q);
  }
  if (bidValue <= 0) return null;
  if (askValue <= 0) return 5;
  return Math.min(5, bidValue / askValue);
}
