// Pump Radar — saf (side-effect'siz) skorlama motoru.
// Hem sunucu route'u hem de istemci tarafından paylaşılan tipleri ve hesaplamaları içerir.
// Amaç: pump BAŞLAMADAN önceki birikim izlerini (hacim, sıkışma, alıcı baskısı, emir defteri,
// 15dk sıcak para girişi, vadeli short squeeze ve sahte pump / bull-trap filtresi)
// tek bir 0-100 skora indirmek ve "çok geç kalmış" veya "tuzak" coinleri elemek.

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
  /** Emir defterindeki ilk büyük satış duvarı fiyatı (+%1.5 ile +%9 arası) */
  askWallPrice?: number | null;
  /** Binance vadeli funding oranı (ör. -0.0003 = -%0.03) */
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
  /** Girişe göre TP1 kâr yüzdesi (%) */
  tp1Pct: number;
  /** Girişe göre TP2 kâr yüzdesi (%) */
  tp2Pct: number;
  /** Risk/Ödül çarpanı (TP1 / Risk) */
  rrRatio: number;
  /** TP1 bir satış duvarının hemen altına mı çekildi? */
  wallAdjusted?: boolean;
}

export interface BtcShieldStatus {
  price: number;
  change15m: number;
  change1h: number;
  change24h: number;
  buyShare1h: number;
  state: "SAFE" | "CAUTION" | "DANGER";
  headline: string;
  detail: string;
}

export interface RadarCoin {
  id: string;
  symbol: string;
  exchange: Exchange;
  price: number;
  change15m: number;
  change1h: number;
  change4h: number;
  change24h: number;
  volume24hUsd: number;
  /** Son 1 saatlik hacim / normal 1 saatlik hacim */
  volSpike: number;
  /** Son 15 dakikalık hacim / normal 15 dakikalık hacim */
  burst15mSpike: number;
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
  /** Özellik 2: Negatif funding + spot alıcı baskısı = Short Squeeze adayı */
  isShortSqueeze: boolean;
  shortSqueezeStrength: "HIGH" | "MEDIUM" | null;
  /** Özellik 3: Son 15 dakikada ani sıcak para ve hacim patlaması */
  isMicroBurst: boolean;
  /** Özellik 4: Sahte yükseliş / CVD dağıtım / Bull-Trap tespiti */
  isBullTrap: boolean;
  trapReasons: string[];
}

export interface RadarPayload {
  generatedAt: number;
  scanned: number;
  lateCount: number;
  trapCount?: number;
  coins: RadarCoin[];
  /** İstenen takip id'leri için güncel fiyatlar */
  prices: Record<string, number>;
  sources: { binance: boolean; mexc: boolean; futures: boolean };
  btcShield?: BtcShieldStatus | null;
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

// ── BTC Tehlike Kalkanı Hesaplayıcı ───────────────────────────────────────────

export function computeBtcShield(meta: CoinMeta | undefined, candles: Candle[]): BtcShieldStatus | null {
  if (!meta || candles.length < 8) return null;
  const n = candles.length;
  const last = candles[n - 1];
  const prev15m = candles[n - 2];
  // Son mum henüz yeni açıldıysa (<2 dk) bir önceki kapanmış 15dk mumu da dikkate al
  const change15m =
    last.o > 0
      ? Math.min((last.c / last.o - 1) * 100, (last.c / prev15m.o - 1) * 100)
      : 0;
  const change1h = candles[n - WINDOW].o > 0 ? (last.c / candles[n - WINDOW].o - 1) * 100 : 0;

  const recent = candles.slice(n - WINDOW);
  const recentQv = recent.reduce((a, c) => a + c.qv, 0);
  const buyShare1h =
    recentQv > 0 && recent.every((c) => c.takerBuyQv !== null)
      ? recent.reduce((a, c) => a + (c.takerBuyQv ?? 0), 0) / recentQv
      : 0.5;

  if (change15m <= -0.75 || change1h <= -1.25 || (change1h <= -0.6 && buyShare1h < 0.42)) {
    return {
      price: meta.price,
      change15m: Number(change15m.toFixed(2)),
      change1h: Number(change1h.toFixed(2)),
      change24h: Number(meta.change24h.toFixed(2)),
      buyShare1h: Number((buyShare1h * 100).toFixed(1)),
      state: "DANGER",
      headline: "🚨 BTC Tehlike Kalkanı Aktif: Bitcoin Sert Satış Baskısında",
      detail: `BTC son 1 saatte ${change1h >= 0 ? "+" : ""}${change1h.toFixed(2)}% (Taker Alıcı: %${(buyShare1h * 100).toFixed(0)}). Bu ortamda altcoin yükselişleri sahte (Bull-Trap) kalabilir; yeni girişlerde çok seçici olun ve stop seviyenizi sıkı tutun.`,
    };
  }

  if (change1h <= -0.45 || change1h >= 3.2 || buyShare1h < 0.46) {
    return {
      price: meta.price,
      change15m: Number(change15m.toFixed(2)),
      change1h: Number(change1h.toFixed(2)),
      change24h: Number(meta.change24h.toFixed(2)),
      buyShare1h: Number((buyShare1h * 100).toFixed(1)),
      state: "CAUTION",
      headline: "⚠️ BTC Kalkanı: Piyasa Dalgalı — Kademeli ve Stoplu İşlem Yapın",
      detail: `BTC $${meta.price.toLocaleString("en-US", { maximumFractionDigits: 0 })} (1s: ${change1h >= 0 ? "+" : ""}${change1h.toFixed(2)}%, Alıcı Payı: %${(buyShare1h * 100).toFixed(0)}). TP1 hedefinde kârın yarısını cebinize koyup stop'u girişe çekmeniz önerilir.`,
    };
  }

  return {
    price: meta.price,
    change15m: Number(change15m.toFixed(2)),
    change1h: Number(change1h.toFixed(2)),
    change24h: Number(meta.change24h.toFixed(2)),
    buyShare1h: Number((buyShare1h * 100).toFixed(1)),
    state: "SAFE",
    headline: "🛡️ BTC Zemini Dengeli & Güvenli — Altcoin Birikimleri İçin Uygun Ortam",
    detail: `BTC $${meta.price.toLocaleString("en-US", { maximumFractionDigits: 0 })} (1s: ${change1h >= 0 ? "+" : ""}${change1h.toFixed(2)}%, Alıcı Payı: %${(buyShare1h * 100).toFixed(0)}). Bitcoin ani satış baskısı göstermiyor; yüksek puanlı birikim adayları sağlıklı çalışabilir.`,
  };
}

// ── Ana skorlama ──────────────────────────────────────────────────────────────

export function buildRadarCoin(meta: CoinMeta, candles: Candle[], extras: RadarExtras = {}): RadarCoin | null {
  const n = candles.length;
  if (n < 40 || meta.price <= 0) return null;

  const last = candles[n - 1];
  const prev = candles[n - 2];
  const price = meta.price > 0 ? meta.price : last.c;

  // Fiyat değişimleri (15dk, 1s, 4s)
  const change15mRaw = last.o > 0 ? (last.c / last.o - 1) * 100 : 0;
  const prev15mRaw = prev.o > 0 ? (prev.c / prev.o - 1) * 100 : 0;
  // Eğer mevcut 15dk mumu henüz yeni başladıysa ve bir önceki mum güçlü kapandıysa ikisinden anlamlı olanı al
  const change15m = Math.abs(change15mRaw) >= Math.abs(prev15mRaw) * 0.5 ? change15mRaw : prev15mRaw;
  const change1h = (last.c / candles[n - WINDOW].o - 1) * 100;
  const change4h = (last.c / candles[n - 16].o - 1) * 100;

  // 1) Saatlik Hacim sıçraması: son 1 saat vs. önceki 1 saatlik pencerelerin MEDYANI
  const recentQv = candles.slice(n - WINDOW).reduce((a, c) => a + c.qv, 0);
  const windows: number[] = [];
  for (let end = n - WINDOW; end - WINDOW >= 0; end -= WINDOW) {
    windows.push(candles.slice(end - WINDOW, end).reduce((a, c) => a + c.qv, 0));
  }
  const baseQvRaw = median(windows);
  const baseQv = Math.max(baseQvRaw, (meta.volume24hUsd / 24) * 0.25);
  const volSpike = baseQv > 0 ? Math.min(recentQv / baseQv, 50) : 0;

  // 2) Özellik 3: Son 15dk Şok Para Girişi (Micro-Burst)
  const base15mQv = Math.max(
    median(candles.slice(0, n - 2).map((c) => c.qv)),
    (meta.volume24hUsd / 96) * 0.3
  );
  const active15mCandle = last.qv >= prev.qv * 0.6 ? last : prev;
  const burst15mSpike = base15mQv > 0 ? Math.min(active15mCandle.qv / base15mQv, 50) : 0;
  const buyShare15m =
    active15mCandle.takerBuyQv !== null && active15mCandle.qv > 0
      ? active15mCandle.takerBuyQv / active15mCandle.qv
      : active15mCandle.c >= active15mCandle.o
      ? 0.6
      : 0.4;
  const active15mChange =
    active15mCandle.o > 0 ? (active15mCandle.c / active15mCandle.o - 1) * 100 : 0;
  const isMicroBurst =
    active15mCandle.qv >= 12_000 &&
    burst15mSpike >= 2.6 &&
    buyShare15m >= 0.57 &&
    active15mChange >= 0.35 &&
    active15mChange <= 6.5 &&
    change1h <= 7.5;

  // 3) Sıkışma: pencereden 4 mum önceki bant genişliği persentili
  const bw = bandwidthSeries(candles.map((c) => c.c));
  let squeezePct: number | null = null;
  if (bw.length >= 30) {
    const ref = bw[bw.length - 1 - WINDOW];
    squeezePct = (bw.filter((v) => v < ref).length / bw.length) * 100;
  }

  // 4) Alıcı payı (1 saatlik)
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

  // 5) Özellik 2: Short Squeeze Tespiti (Negatif Vadeli Funding + Spot Alım Baskısı)
  const fundingRate = extras.funding ?? null;
  const hasSpotSupport =
    (buyShare !== null && buyShare >= 0.52) || volSpike >= 1.4 || isMicroBurst;
  const isShortSqueeze =
    fundingRate !== null && fundingRate <= -0.00008 && hasSpotSupport && change1h > -1.5 && !late;
  const shortSqueezeStrength: "HIGH" | "MEDIUM" | null = !isShortSqueeze
    ? null
    : fundingRate !== null && (fundingRate <= -0.00025 || (fundingRate <= -0.00012 && volSpike >= 1.8))
    ? "HIGH"
    : "MEDIUM";

  // 6) Özellik 4: Sahte Pump & Tuzak Avcısı (Bull-Trap / CVD Uyumsuzluğu / Üst Fitil Reddi)
  const trapReasons: string[] = [];
  const bookRatio = extras.bookRatio ?? null;

  // Tuzak A: Fiyat yükselirken (>%1.0) Taker alıcı payı düşük (<%45) = Gizli Dağıtım (CVD Uyumsuzluğu)
  if (change1h >= 1.0 && buyShare !== null && buyShare < 0.45) {
    trapReasons.push(
      `CVD Uyumsuzluğu: Fiyat +${change1h.toFixed(1)}% artarken hacmin %${Math.round((1 - buyShare) * 100)}'i satıştan geliyor (Gizli Dağıtım)`
    );
  }
  // Tuzak B: Emir defterinde ağır satış duvarı (Ask duvarı Bid duvarının ~2 katı)
  if (bookRatio !== null && bookRatio < 0.55 && change1h >= 0.4) {
    trapReasons.push(
      `Ağır Satış Duvarı: Emir defterinde satış emirleri alışların ${(1 / Math.max(0.1, bookRatio)).toFixed(1)}x katı`
    );
  }
  // Tuzak C: Sert Üst Fitil Reddi (Son 1 saatte tepeye göre >%2.2 geri çekilme + zayıf kapanış)
  const recentHigh = Math.max(...recent.map((c) => c.h));
  const recentLow = Math.min(...recent.map((c) => c.l));
  const dropFromHighPct = recentHigh > 0 ? ((recentHigh - last.c) / recentHigh) * 100 : 0;
  if (
    dropFromHighPct >= 2.2 &&
    recentHigh > recentLow &&
    (last.c - recentLow) / (recentHigh - recentLow) < 0.42
  ) {
    trapReasons.push(
      `Üst Fitil Reddi (Bull-Trap): Son 1s tepesinden -%${dropFromHighPct.toFixed(1)} sert satış yedi`
    );
  }
  const isBullTrap = trapReasons.length > 0;

  // ── Puanlar ──
  let volume =
    volSpike < 1.5 || recentQv < 15_000 ? 0 : 8 + clamp((volSpike - 1.5) / 3.5, 0, 1) * 27; // max 35
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

  const noVolumeFactor = volume > 0 || isMicroBurst ? 1 : 0.4;
  early *= noVolumeFactor;
  squeeze *= volume > 0 || isMicroBurst ? 1 : 0.5;

  let buy = 0; // max 15
  if (buyShare !== null) {
    if (buyShare >= 0.62) buy = 15;
    else if (buyShare >= 0.56) buy = 10;
    else if (buyShare >= 0.52) buy = 4;
    if (buyShareSource === "candle") buy *= 0.7;
  }

  let book = 0; // max 10
  if (bookRatio !== null) {
    if (bookRatio >= 2.5) book = 10;
    else if (bookRatio >= 1.8) book = 7;
    else if (bookRatio >= 1.3) book = 3;
  }

  let funding = 0; // max 5 (Short Squeeze adaylarında +8'e kadar)
  if (fundingRate !== null) {
    if (shortSqueezeStrength === "HIGH") funding = 8;
    else if (fundingRate < 0) funding = 5;
    else if (fundingRate <= 0.00005) funding = 2;
  }

  const microBurstBonus = isMicroBurst ? 8 : 0;
  const latePenalty = meta.change24h > 25 ? 15 : meta.change24h > 15 ? 6 : 0;
  const bookPenalty = bookRatio !== null && bookRatio < 0.6 ? 6 : 0;
  const trapPenalty = isBullTrap ? 18 : 0;

  const total = clamp(
    Math.round(
      volume + early + squeeze + buy + book + funding + microBurstBonus - latePenalty - bookPenalty - trapPenalty
    ),
    0,
    100
  );

  // ── Gerekçeler & riskler ──
  const reasons: string[] = [];
  if (isShortSqueeze && fundingRate !== null) {
    reasons.push(
      `🧨 Short Squeeze Adayı: Vadeli fonlama ${(fundingRate * 100).toFixed(4)}% (Shortlar içeride sıkıştı)`
    );
  }
  if (isMicroBurst) {
    reasons.push(
      `⚡ 15dk Sıcak Para Girişi: Anlık hacim normalin ${burst15mSpike.toFixed(1)}x katı (Alıcı %${Math.round(buyShare15m * 100)})`
    );
  }
  if (volume > 0) {
    reasons.push(`Hacim normalin ${volSpike.toFixed(1)}x katı (son 1 saat)`);
  }
  if ((volume > 0 || isMicroBurst) && change1h < 2.5 && change1h >= 0) {
    reasons.push(`Fiyat henüz sadece +${change1h.toFixed(2)}% — erken birikim evresi`);
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
  if (!isShortSqueeze && fundingRate !== null && funding > 0) {
    reasons.push(`Funding ${(fundingRate * 100).toFixed(4)}% — short kalabalık / nötr`);
  }

  const risks: string[] = [...trapReasons];
  if (sellDominated && !isBullTrap) {
    risks.push(
      `Hacmin çoğu satıştan geliyor (alıcı payı %${Math.round((buyShare ?? 0) * 100)}) — birikim değil dağıtım olabilir`
    );
  }
  if (bookPenalty > 0 && !isBullTrap) {
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

  // ── Özellik 1: Otomatik İşlem Planı (ATR/Swing Stop + Emir Defteri Satış Duvarı Duyarlı TP1/TP2) ──
  const swingLow = Math.min(...candles.slice(n - 12).map((c) => c.l));
  const stopPct = clamp((price - swingLow) / price + 0.003, 0.02, 0.05);
  let tp1 = price * (1 + stopPct * 2);
  let wallAdjusted = false;
  if (
    extras.askWallPrice &&
    extras.askWallPrice > price * 1.018 &&
    extras.askWallPrice < tp1 * 1.05
  ) {
    // İlk büyük satış duvarının hemen altına (%0.3 altı) TP1 koyarak duvara çarpmadan kâr al!
    tp1 = extras.askWallPrice * 0.997;
    wallAdjusted = true;
  }
  const tp2 = Math.max(tp1 * 1.025, price * (1 + stopPct * 3.5));
  const tp1Pct = ((tp1 - price) / price) * 100;
  const tp2Pct = ((tp2 - price) / price) * 100;
  const riskPct = stopPct * 100;
  const rrRatio = riskPct > 0 ? Number((tp1Pct / riskPct).toFixed(1)) : 2.0;

  const plan: TradePlan = {
    entry: price,
    stop: price * (1 - stopPct),
    tp1,
    tp2,
    riskPct,
    tp1Pct,
    tp2Pct,
    rrRatio,
    wallAdjusted,
  };

  return {
    id: coinId(meta.exchange, meta.symbol),
    symbol: meta.symbol,
    exchange: meta.exchange,
    price,
    change15m: Number(change15m.toFixed(2)),
    change1h,
    change4h,
    change24h: meta.change24h,
    volume24hUsd: meta.volume24hUsd,
    volSpike,
    burst15mSpike: Number(burst15mSpike.toFixed(1)),
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
      funding: Math.round(Math.min(5, funding)),
    },
    reasons,
    risks,
    plan,
    late,
    isShortSqueeze,
    shortSqueezeStrength,
    isMicroBurst,
    isBullTrap,
    trapReasons,
  };
}

/** Emir defteri: fiyatın ±%2'si içindeki bid/ask oranı VE ilk büyük satış duvarı (Ask Wall) */
export function computeBookMetrics(
  bids: ReadonlyArray<readonly [string, string]>,
  asks: ReadonlyArray<readonly [string, string]>,
  price: number
): { bookRatio: number | null; askWallPrice: number | null } {
  if (price <= 0) return { bookRatio: null, askWallPrice: null };
  let bidValue = 0;
  let askValue = 0;
  for (const [p, q] of bids) {
    const pr = Number(p);
    if (pr >= price * 0.98) bidValue += pr * Number(q);
  }

  let maxAskOrderUsd = 0;
  let askWallPrice: number | null = null;
  let totalAskLevelsUsd = 0;
  let askCount = 0;

  for (const [p, q] of asks) {
    const pr = Number(p);
    const usd = pr * Number(q);
    if (pr <= price * 1.02) askValue += usd;
    if (pr >= price * 1.015 && pr <= price * 1.08) {
      totalAskLevelsUsd += usd;
      askCount++;
      if (usd > maxAskOrderUsd) {
        maxAskOrderUsd = usd;
        askWallPrice = pr;
      }
    }
  }

  const avgAskUsd = askCount > 0 ? totalAskLevelsUsd / askCount : 0;
  // Yalnızca ortalamanın en az 3.5 katı büyüklüğünde gerçek bir duvar varsa dikkate al
  if (maxAskOrderUsd < avgAskUsd * 3.5 || maxAskOrderUsd < 15_000) {
    askWallPrice = null;
  }

  if (bidValue <= 0) return { bookRatio: null, askWallPrice };
  if (askValue <= 0) return { bookRatio: 5, askWallPrice };
  return { bookRatio: Math.min(5, bidValue / askValue), askWallPrice };
}

/** Geriye dönük uyumluluk için computeBookRatio sarmalayıcısı */
export function computeBookRatio(
  bids: ReadonlyArray<readonly [string, string]>,
  asks: ReadonlyArray<readonly [string, string]>,
  price: number
): number | null {
  return computeBookMetrics(bids, asks, price).bookRatio;
}
