// Pump Radar alarm geçmişi — localStorage'da tutulur, sunucu state'i gerekmez.
// Her alarm için giriş/stop/TP1 kaydedilir; sonraki taramalardaki fiyatla sonuçlandırılır.
// NOT: Fiyat ~60 sn'de bir örneklenir; kısa fitiller / hızlı hareketler kaçabilir.

import type { Exchange, RadarCoin } from "@/lib/pumpRadar";

export type AlertStatus = "open" | "tp1" | "stop" | "timeout";

export interface RadarAlertRecord {
  id: string;
  symbol: string;
  exchange: Exchange;
  ts: number;
  score: number;
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  reasons: string[];
  status: AlertStatus;
  closedAt?: number;
  closePrice?: number;
  /** Kapanış (veya son) fiyatına göre % kâr/zarar */
  pnlPct?: number;
  /** Bildirilen en yüksek fiyat kilometre taşı (%): 3, 5, 10, 20 */
  milestone?: number;
}

export interface RadarStats {
  total: number;
  open: number;
  tp1: number;
  stop: number;
  timeout: number;
  /** TP1'e ulaşan / kapanan alarm (%). Kapanan yoksa null */
  hitRate: number | null;
  /** Kapanan alarmların ortalama % getirisi */
  avgPnl: number | null;
}

const STORAGE_KEY = "pump-radar-history-v1";
export const MAX_HISTORY = 200;
export const TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const DEDUP_MS = 6 * 60 * 60 * 1000;

export function loadHistory(): RadarAlertRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RadarAlertRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(history: RadarAlertRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {
    // kota dolu — yoksay
  }
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Eşik üstü yeni coinler için kayıt açar. Aynı coin 6 saat içinde tekrar alarm üretmez. */
export function addAlerts(
  history: RadarAlertRecord[],
  coins: RadarCoin[],
  threshold: number,
  now: number
): { history: RadarAlertRecord[]; fresh: RadarCoin[] } {
  const fresh: RadarCoin[] = [];
  const records: RadarAlertRecord[] = [];
  for (const coin of coins) {
    if (coin.score < threshold) continue;
    const recentlyAlerted = history.some((h) => h.id === coin.id && now - h.ts < DEDUP_MS);
    if (recentlyAlerted) continue;
    fresh.push(coin);
    records.push({
      id: coin.id,
      symbol: coin.symbol,
      exchange: coin.exchange,
      ts: now,
      score: coin.score,
      entry: coin.plan.entry,
      stop: coin.plan.stop,
      tp1: coin.plan.tp1,
      tp2: coin.plan.tp2,
      reasons: coin.reasons.slice(0, 3),
      status: "open",
    });
  }
  return { history: [...records, ...history].slice(0, MAX_HISTORY), fresh };
}

/** Açık alarmları güncel fiyatlarla sonuçlandırır. */
export function evaluateHistory(
  history: RadarAlertRecord[],
  prices: Record<string, number>,
  now: number
): RadarAlertRecord[] {
  return history.map((h) => {
    if (h.status !== "open") return h;
    const price = prices[h.id];
    if (price && price >= h.tp1) {
      return { ...h, status: "tp1", closedAt: now, closePrice: price, pnlPct: (price / h.entry - 1) * 100 };
    }
    if (price && price <= h.stop) {
      return { ...h, status: "stop", closedAt: now, closePrice: price, pnlPct: (price / h.entry - 1) * 100 };
    }
    if (now - h.ts > TIMEOUT_MS) {
      const closePrice = price ?? h.entry;
      return {
        ...h,
        status: "timeout",
        closedAt: now,
        closePrice,
        pnlPct: (closePrice / h.entry - 1) * 100,
      };
    }
    return h;
  });
}

export function computeStats(history: RadarAlertRecord[]): RadarStats {
  const open = history.filter((h) => h.status === "open").length;
  const tp1 = history.filter((h) => h.status === "tp1").length;
  const stop = history.filter((h) => h.status === "stop").length;
  const timeout = history.filter((h) => h.status === "timeout").length;
  const closed = tp1 + stop + timeout;
  const pnls = history
    .filter((h) => h.status !== "open" && typeof h.pnlPct === "number")
    .map((h) => h.pnlPct as number);
  return {
    total: history.length,
    open,
    tp1,
    stop,
    timeout,
    hitRate: closed > 0 ? (tp1 / closed) * 100 : null,
    avgPnl: pnls.length > 0 ? pnls.reduce((a, b) => a + b, 0) / pnls.length : null,
  };
}

