// Pump Radar olay akışı ("olan biten"): alarm, hedef/stop, fiyat kilometre taşı, skor sıçraması, sistem durumu.
// Saf fonksiyonlar — React/DOM'a bağımlı değil, test edilebilir.

import type { RadarAlertRecord } from "@/lib/radarHistory";
import type { Exchange, RadarCoin } from "@/lib/pumpRadar";

export type RadarEventType = "alert" | "pump" | "tp1" | "tp2" | "stop" | "timeout" | "surge" | "system";
export type EventTone = "good" | "bad" | "info" | "warn";

export interface RadarEvent {
  id: string;
  ts: number;
  type: RadarEventType;
  tone: EventTone;
  coinId?: string;
  symbol?: string;
  exchange?: Exchange;
  title: string;
  message: string;
  /** Masaüstü/telefon bildirimi gönderilsin mi? (gürültüyü azaltmak için surge/info hariç) */
  notify: boolean;
}

const EVENTS_KEY = "pump-radar-events-v1";
export const MAX_EVENTS = 100;
/** Alarmdan beri bu yüzdelere ulaşınca "pump" olayı üretilir */
export const PUMP_MILESTONES = [3, 5, 10, 20] as const;
/** Skor bir taramada en az bu kadar artarsa "surge" olayı */
export const SURGE_DELTA = 12;
export const SURGE_COOLDOWN_MS = 30 * 60 * 1000;

// ── Biçimlendirme (sayfa ile paylaşılır) ──────────────────────────────────────
export function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toPrecision(4);
}

function fmtSigned(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function base(symbol: string): string {
  return symbol.replace("USDT", "");
}

// ── Kalıcılık ─────────────────────────────────────────────────────────────────
export function loadEvents(): RadarEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EVENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RadarEvent[]) : [];
  } catch {
    return [];
  }
}

export function saveEvents(events: RadarEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)));
  } catch {
    // kota dolu — yoksay
  }
}

export function clearEvents(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(EVENTS_KEY);
}

// ── Olay üreticiler ───────────────────────────────────────────────────────────

/**
 * Açık alarmlar ve takip edilen işlemler için: durum geçişleri (TP1/TP2/stop/süre) ve fiyat kilometre taşları.
 */
export function trackProgress(
  before: RadarAlertRecord[],
  evaluated: RadarAlertRecord[],
  prices: Record<string, number>,
  now: number
): { history: RadarAlertRecord[]; events: RadarEvent[] } {
  const events: RadarEvent[] = [];
  const history = evaluated.map((rec, i) => {
    const prev = before[i];
    const name = base(rec.symbol);
    const common = { coinId: rec.id, symbol: rec.symbol, exchange: rec.exchange, ts: now };

    // Durum geçişi: open → kapalı
    if (prev && prev.status === "open" && rec.status !== "open") {
      const pnl = rec.pnlPct ?? 0;
      if (rec.status === "tp2") {
        events.push({
          ...common,
          id: `tp2-${rec.id}-${rec.ts}`,
          type: "tp2",
          tone: "good",
          title: `💰🚀 ${name} ANA HEDEF (TP2) VURULDU! (${fmtSigned(pnl)})`,
          message: `Giriş $${fmtPrice(rec.entry)} → şimdi $${fmtPrice(rec.closePrice ?? rec.tp2)}. Ana hedefe ulaşıldı, kâr realizasyonu tamamlanabilir!`,
          notify: true,
        });
      } else if (rec.status === "tp1") {
        events.push({
          ...common,
          id: `tp1-${rec.id}-${rec.ts}`,
          type: "tp1",
          tone: "good",
          title: `✅💰 ${name} Hedef 1'e (TP1) ulaştı (${fmtSigned(pnl)}) — Kâr Al!`,
          message: `Giriş $${fmtPrice(rec.entry)} → şimdi $${fmtPrice(rec.closePrice ?? rec.tp1)}. Kârın yarısını alıp stop'u girişe ($${fmtPrice(rec.entry)}) çekmeyi düşün.`,
          notify: true,
        });
      } else if (rec.status === "stop") {
        events.push({
          ...common,
          id: `stop-${rec.id}-${rec.ts}`,
          type: "stop",
          tone: "bad",
          title: `🛑 ${name} Stop-Loss seviyesine indi (${fmtSigned(pnl)})`,
          message: `Plan geçersiz: giriş $${fmtPrice(rec.entry)}, stop $${fmtPrice(rec.stop)}. Sermayeyi korumak için çıkış önerilir.`,
          notify: true,
        });
      } else {
        events.push({
          ...common,
          id: `timeout-${rec.id}-${rec.ts}`,
          type: "timeout",
          tone: "info",
          title: `⏱ ${name} alarmı 24 saat sonunda kapandı (${fmtSigned(pnl)})`,
          message: "Ne hedefe ne stop'a ulaştı; süre doldu.",
          notify: false,
        });
      }
      return rec;
    }

    // Açık alarm: fiyat kilometre taşı
    if (rec.status === "open") {
      const price = prices[rec.id];
      if (price && rec.entry > 0) {
        const pnl = (price / rec.entry - 1) * 100;
        const reached = [...PUMP_MILESTONES].filter((m) => pnl >= m && m > (rec.milestone ?? 0));
        if (reached.length > 0) {
          const m = reached[reached.length - 1];
          events.push({
            ...common,
            id: `pump-${rec.id}-${rec.ts}-${m}`,
            type: "pump",
            tone: "good",
            title: `📈 ${name} alarmdan beri +%${m} yükseldi`,
            message: `Giriş $${fmtPrice(rec.entry)} → şimdi $${fmtPrice(price)} (${fmtSigned(pnl)}). Hedef 1: $${fmtPrice(rec.tp1)}.`,
            notify: true,
          });
          return { ...rec, milestone: m };
        }
      }
    }
    return rec;
  });
  return { history, events };
}

/** Yeni alarm olayları (skor eşiği aşıldı). */
export function alertEvents(fresh: RadarCoin[], now: number): RadarEvent[] {
  return fresh.map((c) => {
    const tag = c.isShortSqueeze
      ? "🧨 SHORT SQUEEZE + BİRİKİM"
      : c.isMicroBurst
      ? "⚡ 15DK SICAK PARA GİRİŞİ"
      : `Radar skoru ${c.score}`;
    return {
      id: `alert-${c.id}-${now}`,
      ts: now,
      type: "alert" as const,
      tone: "good" as const,
      coinId: c.id,
      symbol: c.symbol,
      exchange: c.exchange,
      title: `🚀 ${base(c.symbol)} — ${tag}`,
      message: `${c.reasons.slice(0, 2).join(" · ")}. Giriş $${fmtPrice(c.plan.entry)} · Stop $${fmtPrice(c.plan.stop)} · TP1 $${fmtPrice(c.plan.tp1)} (+%${c.plan.tp1Pct.toFixed(1)})`,
      notify: true,
    };
  });
}

/**
 * Skoru önceki taramaya göre belirgin artan (ama henüz alarm üretmemiş) coinler.
 */
export function detectSurges(
  coins: RadarCoin[],
  prevScores: Record<string, number>,
  freshIds: ReadonlySet<string>,
  recentSurgeCoinIds: ReadonlySet<string>,
  threshold: number,
  now: number
): RadarEvent[] {
  const out: RadarEvent[] = [];
  for (const c of coins) {
    if (c.isBullTrap) continue;
    const prev = prevScores[c.id];
    if (prev === undefined) continue;
    if (freshIds.has(c.id) || recentSurgeCoinIds.has(c.id)) continue;
    if (c.score - prev >= SURGE_DELTA && c.score >= threshold - 10) {
      out.push({
        id: `surge-${c.id}-${now}`,
        ts: now,
        type: "surge",
        tone: "info",
        coinId: c.id,
        symbol: c.symbol,
        exchange: c.exchange,
        title: `⚡ ${base(c.symbol)} skoru hızla yükseliyor (${prev} → ${c.score})`,
        message: c.reasons[0] ?? "Birikim işaretleri güçleniyor",
        notify: false,
      });
    }
  }
  return out;
}

export function systemEvent(ok: boolean, now: number): RadarEvent {
  return ok
    ? {
        id: `system-ok-${now}`,
        ts: now,
        type: "system",
        tone: "info",
        title: "✅ Borsa veri akışı geri geldi",
        message: "Tarama normal şekilde devam ediyor.",
        notify: false,
      }
    : {
        id: `system-down-${now}`,
        ts: now,
        type: "system",
        tone: "warn",
        title: "⚠ Borsa verisine ulaşılamıyor",
        message: "Radar veri alamıyor; açık alarmların takibi duraklatıldı. Otomatik yeniden denenecek.",
        notify: true,
      };
}

export function recentSurgeIds(events: RadarEvent[], now: number): Set<string> {
  const ids = new Set<string>();
  for (const e of events) {
    if (e.type === "surge" && e.coinId && now - e.ts < SURGE_COOLDOWN_MS) ids.add(e.coinId);
  }
  return ids;
}
