"use client";

// Pump Radar — grafik okumadan, tek bir skorlu listeyle "pump başlamadan önce" birikim yapan coinleri yakala.
// Canlı Bildirim & Olan Biten Akışı: yeni alarmlar, +%3/+%5/+%10/+%20 yükseliş kilometre taşları,
// Hedef 1 (TP1), Stop, skor sıçramaları (+12 puan) ve borsa bağlantı durumu anlık bildirilir.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  Radar,
  Volume2,
  VolumeX,
  ShieldAlert,
  ShieldCheck,
  Target,
  Trash2,
  LineChart,
  Clock,
  Flame,
  Bell,
  BellRing,
  BellOff,
  Activity,
  Send,
  Smartphone,
  Download,
  Sun,
  Home,
  LayoutGrid,
  Coins,
  Zap,
  CheckCircle2,
  Crosshair,
  X,
} from "lucide-react";
import { useDashboardStore } from "@/lib/store";
import type { BtcShieldStatus, RadarCoin, RadarPayload, ScoreBreakdown } from "@/lib/pumpRadar";
import {
  addAlerts,
  addManualTrack,
  clearHistory,
  computeStats,
  evaluateHistory,
  loadHistory,
  removeTrackedRecord,
  saveHistory,
  type AlertStatus,
  type RadarAlertRecord,
} from "@/lib/radarHistory";
import {
  alertEvents,
  clearEvents,
  detectSurges,
  fmtPrice,
  loadEvents,
  MAX_EVENTS,
  recentSurgeIds,
  saveEvents,
  systemEvent,
  trackProgress,
  type EventTone,
  type RadarEvent,
} from "@/lib/radarEvents";
import {
  detectMobilePlatform,
  enableNotifications,
  ensureServiceWorker,
  getNotifyPermission,
  requestScreenWakeLock,
  showSystemNotification,
  type MobilePlatformInfo,
  type NotifyPermission,
} from "@/lib/radarNotify";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const REFRESH_MS = 60_000;
const THRESHOLDS = [60, 70, 80] as const;

// ── Biçimlendirme ─────────────────────────────────────────────────────────────
function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s} sn önce`;
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  return `${Math.floor(s / 86400)} gün önce`;
}

function scoreTone(score: number): { text: string; ring: string; label: string } {
  if (score >= 80) return { text: "text-emerald-400", ring: "border-emerald-400/60 bg-emerald-400/10", label: "ÇOK GÜÇLÜ" };
  if (score >= 70) return { text: "text-emerald-400", ring: "border-emerald-400/40 bg-emerald-400/5", label: "GÜÇLÜ" };
  if (score >= 55) return { text: "text-amber-400", ring: "border-amber-400/40 bg-amber-400/5", label: "İZLE" };
  return { text: "text-slate-400", ring: "border-white/10 bg-white/5", label: "ZAYIF" };
}

const BREAKDOWN_META: Array<{ key: keyof ScoreBreakdown; label: string; color: string; max: number }> = [
  { key: "volume", label: "Hacim", color: "bg-emerald-400", max: 35 },
  { key: "early", label: "Erken evre", color: "bg-cyan-400", max: 20 },
  { key: "squeeze", label: "Sıkışma", color: "bg-violet-400", max: 15 },
  { key: "buy", label: "Alıcı baskısı", color: "bg-amber-400", max: 15 },
  { key: "book", label: "Emir defteri", color: "bg-sky-400", max: 10 },
  { key: "funding", label: "Funding", color: "bg-rose-400", max: 5 },
];

const EVENT_TONE_STYLE: Record<EventTone, { border: string; badge: string; dot: string }> = {
  good: {
    border: "border-emerald-500/30 bg-emerald-950/20",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  bad: {
    border: "border-rose-500/30 bg-rose-950/20",
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    dot: "bg-rose-400",
  },
  warn: {
    border: "border-amber-500/30 bg-amber-950/20",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    dot: "bg-amber-400",
  },
  info: {
    border: "border-sky-500/25 bg-sky-950/15",
    badge: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    dot: "bg-sky-400",
  },
};

// ── Alt bileşenler ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#0d0e12] px-3.5 py-3 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-gray-500">{label}</span>
      <span className={`font-mono text-xl font-bold ${tone ?? "text-white"}`}>{value}</span>
      {sub && <span className="text-[10px] text-gray-500">{sub}</span>}
    </div>
  );
}

function BreakdownBar({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-black/50" title="Skor dağılımı">
      {BREAKDOWN_META.map((m) =>
        breakdown[m.key] > 0 ? (
          <div
            key={m.key}
            className={m.color}
            style={{ width: `${breakdown[m.key]}%` }}
            title={`${m.label}: ${breakdown[m.key]}/${m.max}`}
          />
        ) : null
      )}
    </div>
  );
}

function BtcShieldBanner({ shield }: { shield: BtcShieldStatus }) {
  const tone =
    shield.state === "DANGER"
      ? {
          wrap: "border-rose-500/40 bg-gradient-to-r from-rose-950/50 via-[#0d0e12] to-[#0d0e12]",
          badge: "bg-rose-500/20 text-rose-300 border-rose-500/40",
          icon: <ShieldAlert size={16} className="text-rose-400 animate-pulse flex-none" />,
        }
      : shield.state === "CAUTION"
      ? {
          wrap: "border-amber-500/35 bg-gradient-to-r from-amber-950/35 via-[#0d0e12] to-[#0d0e12]",
          badge: "bg-amber-500/20 text-amber-300 border-amber-500/40",
          icon: <ShieldAlert size={16} className="text-amber-400 flex-none" />,
        }
      : {
          wrap: "border-emerald-500/30 bg-gradient-to-r from-emerald-950/30 via-[#0d0e12] to-[#0d0e12]",
          badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
          icon: <ShieldCheck size={16} className="text-emerald-400 flex-none" />,
        };

  return (
    <section className={`rounded-2xl border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${tone.wrap}`}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5">{tone.icon}</div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-white">{shield.headline}</span>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${tone.badge}`}>
              BTC ${fmtPrice(shield.price)} · 15dk {fmtPct(shield.change15m)} · 1s {fmtPct(shield.change1h)}
            </span>
          </div>
          <p className="text-[11px] text-gray-300 leading-relaxed">{shield.detail}</p>
        </div>
      </div>
    </section>
  );
}

function ActiveTrackedPanel({
  records,
  prices,
  onRemove,
  onOpenChart,
}: {
  records: RadarAlertRecord[];
  prices: Record<string, number>;
  onRemove: (id: string, ts: number) => void;
  onOpenChart: (symbol: string) => void;
}) {
  if (records.length === 0) return null;

  return (
    <section className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/25 via-[#0d0e12] to-[#0d0e12] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
          <Crosshair size={15} className="animate-pulse" />
          <span>CANLI HEDEF &amp; STOP TAKİPÇİSİ ({records.length} Aktif İşlem)</span>
        </div>
        <span className="text-[10px] text-gray-400">
          TP1, TP2 veya Stop vurulduğu an sesli + telefon/masaüstü bildirimi gönderilir
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {records.map((r) => {
          const base = r.symbol.replace("USDT", "");
          const livePrice = prices[r.id] ?? r.entry;
          const pnl = r.entry > 0 ? ((livePrice - r.entry) / r.entry) * 100 : 0;
          const totalSpan = Math.max(0.000001, r.tp2 - r.stop);
          const progressPct = Math.min(100, Math.max(0, ((livePrice - r.stop) / totalSpan) * 100));
          const entryPosPct = Math.min(100, Math.max(0, ((r.entry - r.stop) / totalSpan) * 100));
          const tp1PosPct = Math.min(100, Math.max(0, ((r.tp1 - r.stop) / totalSpan) * 100));

          return (
            <div
              key={`${r.id}-${r.ts}`}
              className="rounded-xl bg-black/50 border border-white/10 p-3 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white">{base}/USDT</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">
                    {r.exchange}
                  </span>
                  {r.manual && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/30 text-cyan-300">
                      Manuel Takip
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-xs font-extrabold px-2 py-0.5 rounded ${
                      pnl >= 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
                    }`}
                  >
                    {fmtPct(pnl)}
                  </span>
                  {r.exchange === "BINANCE" && (
                    <button
                      onClick={() => onOpenChart(r.symbol)}
                      className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-300"
                      title="Grafikte aç"
                    >
                      <LineChart size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => onRemove(r.id, r.ts)}
                    className="p-1 rounded bg-white/5 hover:bg-rose-500/20 text-gray-400 hover:text-rose-300 transition-colors"
                    title="Takipten çıkar"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>

              {/* Stop -> Giriş -> TP1 -> TP2 İlerleme Çubuğu */}
              <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    livePrice >= r.entry ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
                <span
                  className="absolute top-0 bottom-0 w-0.5 bg-white/70"
                  style={{ left: `${entryPosPct}%` }}
                  title="Giriş"
                />
                <span
                  className="absolute top-0 bottom-0 w-0.5 bg-emerald-300"
                  style={{ left: `${tp1PosPct}%` }}
                  title="TP1"
                />
              </div>

              <div className="grid grid-cols-4 gap-1 font-mono text-[10px] text-gray-400">
                <div>
                  <span className="block text-[8px] text-rose-400 uppercase font-sans">Stop</span>
                  <b className="text-rose-300">${fmtPrice(r.stop)}</b>
                </div>
                <div>
                  <span className="block text-[8px] text-gray-400 uppercase font-sans">Giriş</span>
                  <b className="text-gray-200">${fmtPrice(r.entry)}</b>
                </div>
                <div>
                  <span className="block text-[8px] text-cyan-300 uppercase font-sans">Canlı</span>
                  <b className="text-white">${fmtPrice(livePrice)}</b>
                </div>
                <div className="text-right">
                  <span className="block text-[8px] text-emerald-400 uppercase font-sans">TP1 / TP2</span>
                  <b className="text-emerald-300">
                    ${fmtPrice(r.tp1)} / ${fmtPrice(r.tp2)}
                  </b>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CoinCard({
  coin,
  rank,
  isTracked,
  onTrack,
  onOpenChart,
}: {
  coin: RadarCoin;
  rank: number;
  isTracked: boolean;
  onTrack: (coin: RadarCoin) => void;
  onOpenChart: (symbol: string) => void;
}) {
  const tone = scoreTone(coin.score);
  const base = coin.symbol.replace("USDT", "");
  return (
    <article
      className={`rounded-2xl border p-4 flex flex-col gap-3 transition-colors ${
        coin.isBullTrap
          ? "border-rose-500/35 bg-gradient-to-br from-rose-950/20 via-[#0d0e12] to-[#0d0e12]"
          : coin.isShortSqueeze
          ? "border-violet-500/35 bg-gradient-to-br from-violet-950/20 via-[#0d0e12] to-[#0d0e12]"
          : coin.isMicroBurst
          ? "border-amber-500/35 bg-gradient-to-br from-amber-950/20 via-[#0d0e12] to-[#0d0e12]"
          : "border-white/5 bg-[#0d0e12] hover:border-white/15"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex-none w-14 h-14 rounded-xl border flex flex-col items-center justify-center ${tone.ring}`}>
          <span className={`font-mono text-xl font-extrabold leading-none ${tone.text}`}>{coin.score}</span>
          <span className="text-[8px] tracking-wider text-gray-400 mt-1">{tone.label}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-gray-600">#{rank}</span>
            <h3 className="text-base font-bold text-white">{base}</h3>
            <span className="text-[10px] text-gray-500 font-mono">/USDT</span>
            <span
              className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                coin.exchange === "BINANCE"
                  ? "border-amber-400/30 text-amber-300 bg-amber-400/5"
                  : "border-sky-400/30 text-sky-300 bg-sky-400/5"
              }`}
            >
              {coin.exchange}
            </span>

            {/* Özellik 2: Short Squeeze Rozeti */}
            {coin.isShortSqueeze && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-400/40 text-violet-200 shadow-[0_0_12px_rgba(139,92,246,0.3)]">
                🧨 SHORT SQUEEZE ADAYI
                {coin.funding !== null ? ` (${(coin.funding * 100).toFixed(3)}%)` : ""}
              </span>
            )}

            {/* Özellik 3: 15dk Sıcak Para Girişi Rozeti */}
            {coin.isMicroBurst && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                <Zap size={10} /> 15DK SICAK PARA ({coin.burst15mSpike.toFixed(1)}x)
              </span>
            )}

            {/* Özellik 4: Sahte Pump / Tuzak Avcısı Rozeti */}
            {coin.isBullTrap && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/25 border border-rose-400/50 text-rose-200">
                <ShieldAlert size={11} /> TUZAK / DAĞITIM UYARISI
              </span>
            )}
          </div>
          <div className="mt-1 flex items-baseline gap-3 font-mono text-xs text-gray-400 flex-wrap">
            <span className="text-white font-semibold">${fmtPrice(coin.price)}</span>
            <span className={coin.change15m >= 0 ? "text-emerald-400" : "text-rose-400"}>
              15dk {fmtPct(coin.change15m)}
            </span>
            <span className={coin.change1h >= 0 ? "text-emerald-400" : "text-rose-400"}>1s {fmtPct(coin.change1h)}</span>
            <span className={coin.change4h >= 0 ? "text-emerald-400" : "text-rose-400"}>4s {fmtPct(coin.change4h)}</span>
            <span className={coin.change24h >= 0 ? "text-emerald-400" : "text-rose-400"}>24s {fmtPct(coin.change24h)}</span>
            <span className="text-gray-500">Hacim {fmtUsd(coin.volume24hUsd)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => onTrack(coin)}
            disabled={isTracked}
            className={`flex-none flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              isTracked
                ? "bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 cursor-default"
                : "bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
            }`}
            title="Bu coinin Giriş / TP1 / TP2 / Stop seviyelerini canlı takibe al ve vurulduğunda bildirim gönder"
          >
            {isTracked ? (
              <>
                <CheckCircle2 size={12} /> Takipte
              </>
            ) : (
              <>
                <Crosshair size={12} /> İşlemi Takibe Al
              </>
            )}
          </button>

          {coin.exchange === "BINANCE" && (
            <button
              onClick={() => onOpenChart(coin.symbol)}
              className="flex-none flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-gray-300 transition-colors"
              title="Ana panelde grafikle aç"
            >
              <LineChart size={12} /> Grafik
            </button>
          )}
        </div>
      </div>

      <BreakdownBar breakdown={coin.breakdown} />

      {/* Neden? */}
      <ul className="flex flex-col gap-1">
        {coin.reasons.map((r) => (
          <li key={r} className="text-[12px] text-gray-300 flex gap-2">
            <span className="text-emerald-400">▸</span>
            {r}
          </li>
        ))}
      </ul>

      {/* Özellik 1: Otomatik İşlem Planı (Giriş / Stop / TP1 / TP2) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
        <div className="rounded-lg bg-black/40 border border-white/5 px-2.5 py-2">
          <div className="text-[9px] uppercase text-gray-500 font-sans">İdeal Giriş</div>
          <div className="text-white font-semibold">${fmtPrice(coin.plan.entry)}</div>
        </div>
        <div className="rounded-lg bg-black/40 border border-rose-500/20 px-2.5 py-2">
          <div className="text-[9px] uppercase text-rose-400/80 font-sans">
            Stop-Loss (-%{coin.plan.riskPct.toFixed(1)})
          </div>
          <div className="text-rose-400 font-semibold">${fmtPrice(coin.plan.stop)}</div>
        </div>
        <div className="rounded-lg bg-black/40 border border-emerald-500/25 px-2.5 py-2">
          <div className="text-[9px] uppercase text-emerald-400/90 font-sans flex items-center justify-between">
            <span>Hedef 1 (+%{coin.plan.tp1Pct.toFixed(1)})</span>
            {coin.plan.wallAdjusted && (
              <span className="text-[8px] px-1 rounded bg-emerald-500/20 text-emerald-300">Duvar Altı</span>
            )}
          </div>
          <div className="text-emerald-400 font-semibold">${fmtPrice(coin.plan.tp1)}</div>
        </div>
        <div className="rounded-lg bg-black/40 border border-emerald-500/20 px-2.5 py-2">
          <div className="text-[9px] uppercase text-emerald-300/80 font-sans">
            Hedef 2 (+%{coin.plan.tp2Pct.toFixed(1)} · 1:{coin.plan.rrRatio}R)
          </div>
          <div className="text-emerald-300 font-semibold">${fmtPrice(coin.plan.tp2)}</div>
        </div>
      </div>

      {coin.risks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {coin.risks.map((r) => (
            <span
              key={r}
              className={`flex items-center gap-1 text-[10px] rounded-md px-2 py-1 border ${
                r.includes("CVD") || r.includes("Bull-Trap") || r.includes("Satış Duvarı")
                  ? "text-rose-200 bg-rose-500/15 border-rose-400/35 font-semibold"
                  : "text-amber-300/90 bg-amber-400/5 border-amber-400/20"
              }`}
            >
              <ShieldAlert size={10} /> {r}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

const STATUS_META: Record<AlertStatus, { label: string; cls: string }> = {
  open: { label: "AÇIK", cls: "border-sky-400/30 text-sky-300 bg-sky-400/5" },
  tp1: { label: "HEDEF 1 ✓", cls: "border-emerald-400/40 text-emerald-300 bg-emerald-400/10" },
  tp2: { label: "ANA HEDEF (TP2) 🚀", cls: "border-emerald-400/60 text-emerald-200 bg-emerald-500/20" },
  stop: { label: "STOP ✗", cls: "border-rose-400/40 text-rose-300 bg-rose-400/10" },
  timeout: { label: "24S DOLDU", cls: "border-white/15 text-gray-300 bg-white/5" },
};

function HistoryList({ history, now }: { history: RadarAlertRecord[]; now: number }) {
  if (history.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-[#0d0e12] p-10 text-center text-sm text-gray-500">
        Henüz alarm yok. Skor eşiğini aşan bir coin çıkınca burada kaydedilir ve sonucu otomatik takip edilir.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/5 bg-[#0d0e12] overflow-hidden">
      <div className="hidden sm:grid grid-cols-[1.1fr_0.6fr_1fr_1fr_1fr_0.9fr_0.9fr] gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/5">
        <span>Coin</span>
        <span>Skor</span>
        <span>Giriş</span>
        <span>Stop</span>
        <span>Hedef 1</span>
        <span>Sonuç</span>
        <span className="text-right">K/Z</span>
      </div>
      {history.map((h) => {
        const meta = STATUS_META[h.status];
        return (
          <div
            key={`${h.id}-${h.ts}`}
            className="grid grid-cols-2 sm:grid-cols-[1.1fr_0.6fr_1fr_1fr_1fr_0.9fr_0.9fr] gap-2 px-4 py-3 items-center border-b border-white/5 last:border-0 font-mono text-xs"
          >
            <div className="flex flex-col font-sans">
              <span className="font-bold text-white">{h.symbol.replace("USDT", "")}</span>
              <span className="text-[10px] text-gray-500 flex items-center gap-1">
                <Clock size={9} /> {timeAgo(h.ts, now)} · {h.exchange}
              </span>
            </div>
            <span className="text-gray-200">{h.score}</span>
            <span className="text-gray-200">${fmtPrice(h.entry)}</span>
            <span className="text-rose-400">${fmtPrice(h.stop)}</span>
            <span className="text-emerald-400">${fmtPrice(h.tp1)}</span>
            <span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border font-sans ${meta.cls}`}>{meta.label}</span>
            </span>
            <span
              className={`text-right font-semibold ${
                h.pnlPct === undefined ? "text-gray-600" : h.pnlPct >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {h.pnlPct === undefined ? "—" : fmtPct(h.pnlPct)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EventFeedList({
  events,
  now,
  onOpenChart,
}: {
  events: RadarEvent[];
  now: number;
  onOpenChart: (symbol: string) => void;
}) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-white/5 bg-[#0d0e12] p-10 text-center text-sm text-gray-500">
        Henüz kaydedilmiş bir olay yok. Tarama tamamlandığında veya eşik aşıldığında burası anlık güncellenir.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {events.map((ev) => {
        const style = EVENT_TONE_STYLE[ev.tone];
        return (
          <div
            key={ev.id}
            className={`rounded-xl border p-3.5 flex items-start justify-between gap-3 transition-all ${style.border}`}
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-none ${style.dot}`} />
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white">{ev.title}</span>
                  {ev.exchange && (
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-white/10 text-gray-300 bg-black/30">
                      {ev.exchange}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-gray-400">{timeAgo(ev.ts, now)}</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">{ev.message}</p>
              </div>
            </div>

            {ev.symbol && ev.exchange === "BINANCE" && (
              <button
                onClick={() => onOpenChart(ev.symbol as string)}
                className="flex-none flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[11px] text-gray-300 transition-colors"
              >
                <LineChart size={11} /> Grafik
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Sayfa ─────────────────────────────────────────────────────────────────────
export default function RadarPage() {
  const router = useRouter();
  const setSymbol = useDashboardStore((s) => s.setSymbol);

  const [data, setData] = useState<RadarPayload | null>(null);
  const [history, setHistory] = useState<RadarAlertRecord[]>([]);
  const [events, setEvents] = useState<RadarEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"radar" | "events" | "history">("radar");
  const [filterMode, setFilterMode] = useState<"clean" | "micro_burst" | "short_squeeze" | "traps">("clean");
  const [threshold, setThreshold] = useState<number>(70);
  const [soundOn, setSoundOn] = useState(false);
  const [notifyPerm, setNotifyPerm] = useState<NotifyPermission>("default");
  const [platform, setPlatform] = useState<MobilePlatformInfo>({
    isMobile: false,
    isIOS: false,
    isAndroid: false,
    isStandalone: false,
    needsIOSInstall: false,
    wakeLockSupported: false,
  });
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showMobileGuide, setShowMobileGuide] = useState(false);
  const [wakeLockOn, setWakeLockOn] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const thresholdRef = useRef(threshold);
  const soundRef = useRef(soundOn);
  const audioRef = useRef<AudioContext | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const wakeLockWantedRef = useRef(false);
  const lastScanTsRef = useRef<number>(0);
  const prevScoresRef = useRef<Record<string, number>>({});
  const sourcesOkRef = useRef<boolean>(true);
  const initializedScanRef = useRef<boolean>(false);
  const tabRef = useRef(tab);

  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  const playTone = useCallback((tone: EventTone) => {
    const ctx = audioRef.current;
    if (!ctx || !soundRef.current) return;
    try {
      const nowTime = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone === "bad" ? "sawtooth" : "sine";

      if (tone === "good") {
        osc.frequency.setValueAtTime(660, nowTime);
        osc.frequency.setValueAtTime(990, nowTime + 0.14);
      } else if (tone === "bad") {
        osc.frequency.setValueAtTime(340, nowTime);
        osc.frequency.setValueAtTime(220, nowTime + 0.18);
      } else {
        osc.frequency.setValueAtTime(740, nowTime);
      }

      gain.gain.setValueAtTime(0.0001, nowTime);
      gain.gain.exponentialRampToValueAtTime(0.24, nowTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, nowTime + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(nowTime);
      osc.stop(nowTime + 0.48);
    } catch {
      // AudioContext hatasını yoksay
    }
  }, []);

  const dispatchNotifications = useCallback(
    (newEvents: RadarEvent[]) => {
      if (newEvents.length === 0) return;

      // Sesli uyarı (en yüksek öncelikli olaya göre)
      const hasGood = newEvents.some((e) => e.tone === "good");
      const hasBad = newEvents.some((e) => e.tone === "bad");
      playTone(hasGood ? "good" : hasBad ? "bad" : "info");

      // Sayfa içi Toast ve Masaüstü Bildirimleri
      newEvents.slice(0, 4).forEach((ev) => {
        if (ev.tone === "good") {
          toast.success(ev.title, { description: ev.message, duration: 10000 });
        } else if (ev.tone === "bad") {
          toast.error(ev.title, { description: ev.message, duration: 10000 });
        } else if (ev.tone === "warn") {
          toast.warning(ev.title, { description: ev.message, duration: 8000 });
        } else {
          toast(ev.title, { description: ev.message, duration: 7000 });
        }

        if (ev.notify) {
          void showSystemNotification(ev.title, ev.message, ev.id);
        }
      });
    },
    [playTone]
  );

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    const storedHistory = loadHistory();
    const storedEvents = loadEvents();
    const openIds = storedHistory.filter((h) => h.status === "open").map((h) => h.id);
    const url = `/api/market/pump-radar${openIds.length ? `?track=${encodeURIComponent(openIds.join(","))}` : ""}`;

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as RadarPayload;
      const ts = Date.now();

      // 1) Açık alarmları değerlendir + hedef/stop/pump kilometre taşı olaylarını üret
      const evaluated = evaluateHistory(storedHistory, payload.prices ?? {}, ts);
      const { history: progressed, events: progressEvs } = trackProgress(
        storedHistory,
        evaluated,
        payload.prices ?? {},
        ts
      );

      // 2) Yeni alarmları ekle + olaylarını üret
      const { history: nextHistory, fresh } = addAlerts(progressed, payload.coins, thresholdRef.current, ts);
      saveHistory(nextHistory);
      const freshEvs = alertEvents(fresh, ts);

      // 3) Skor sıçramalarını (+12 puan) yakala
      const freshIds = new Set(fresh.map((c) => c.id));
      const surgeEvs = detectSurges(
        payload.coins,
        prevScoresRef.current,
        freshIds,
        recentSurgeIds(storedEvents, ts),
        thresholdRef.current,
        ts
      );

      // Güncel skorları bir sonraki karşılaştırma için sakla
      const nextScoreMap: Record<string, number> = {};
      for (const c of payload.coins) nextScoreMap[c.id] = c.score;
      prevScoresRef.current = nextScoreMap;

      // 4) Borsa sağlık durumu değişimi
      const isOk = payload.sources.binance || payload.sources.mexc;
      const sysEvs: RadarEvent[] = [];
      if (isOk !== sourcesOkRef.current) {
        sysEvs.push(systemEvent(isOk, ts));
        sourcesOkRef.current = isOk;
      }

      // 5) İlk tarama özeti (eğer geçmişte hiç olay yoksa kullanıcıya radarın çalıştığını göster)
      const initialEvs: RadarEvent[] = [];
      if (!initializedScanRef.current) {
        initializedScanRef.current = true;
        if (storedEvents.length === 0 && payload.coins.length > 0) {
          const top = payload.coins[0];
          initialEvs.push({
            id: `scan-init-${ts}`,
            ts,
            type: "system",
            tone: "info",
            coinId: top.id,
            symbol: top.symbol,
            exchange: top.exchange,
            title: `📡 Radar aktif: ${payload.scanned} coin tarandı`,
            message: `Şu an en güçlü aday ${top.symbol.replace("USDT", "")} (Skor ${top.score} · ${top.reasons[0] ?? "Birikim izleniyor"}).`,
            notify: false,
          });
        }
      }

      const incoming = [...freshEvs, ...progressEvs, ...surgeEvs, ...sysEvs, ...initialEvs];
      const mergedEvents = [...incoming, ...storedEvents].slice(0, MAX_EVENTS);
      if (incoming.length > 0) {
        saveEvents(mergedEvents);
        if (tabRef.current !== "events") {
          setUnreadCount((c) => c + incoming.length);
        }
        dispatchNotifications(incoming);
      }

      setEvents(mergedEvents);
      setHistory(nextHistory);
      setData(payload);
      setNow(ts);
      lastScanTsRef.current = ts;
      setError(null);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError("Radar verisi alınamadı. Birkaç saniye sonra otomatik yeniden denenecek.");
    } finally {
      setLoading(false);
    }
  }, [dispatchNotifications]);

  // Kayıtlı ayarları yükle + 60 sn'lik tarama döngüsü + mobil olay dinleyicileri
  useEffect(() => {
    void ensureServiceWorker();
    const savedThreshold = Number(window.localStorage.getItem("radar-threshold"));
    const initialThreshold = THRESHOLDS.includes(savedThreshold as (typeof THRESHOLDS)[number])
      ? savedThreshold
      : 70;
    thresholdRef.current = initialThreshold;

    setPlatform(detectMobilePlatform());
    setNotifyPerm(getNotifyPermission());
    setEvents(loadEvents());
    setHistory(loadHistory());
    if (initialThreshold !== 70) setThreshold(initialThreshold);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Mobil ekran kilidi açıldığında veya sekmeye dönüldüğünde hemen kontrol et ve Wake Lock'u yenile
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setNotifyPerm(getNotifyPermission());
        if (Date.now() - lastScanTsRef.current > 30_000) {
          void refresh();
        }
        if (wakeLockWantedRef.current && !wakeLockRef.current) {
          void requestScreenWakeLock().then((wl) => {
            wakeLockRef.current = wl;
          });
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(interval);
      clearInterval(tick);
      abortRef.current?.abort();
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      document.removeEventListener("visibilitychange", onVisibility);
      void wakeLockRef.current?.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSound = () => {
    if (!soundOn && !audioRef.current) {
      audioRef.current = new AudioContext();
    }
    const nextState = !soundOn;
    soundRef.current = nextState;
    setSoundOn(nextState);
    if (nextState) {
      playTone("good");
      toast.success("🔊 Sesli radar uyarıları açıldı");
    }
  };

  const toggleWakeLock = async () => {
    if (wakeLockOn) {
      wakeLockWantedRef.current = false;
      await wakeLockRef.current?.release();
      wakeLockRef.current = null;
      setWakeLockOn(false);
      toast("Ekran kilidi koruması kapatıldı");
      return;
    }
    const wl = await requestScreenWakeLock();
    if (wl) {
      wakeLockRef.current = wl;
      wakeLockWantedRef.current = true;
      setWakeLockOn(true);
      wl.addEventListener("release", () => {
        wakeLockRef.current = null;
      });
      toast.success("📱 Ekran açık tutma aktif — telefonunuz tarama sırasında uykuya geçmeyecek");
    } else {
      toast.error("Cihazınız ekran açık tutma özelliğini desteklemiyor.");
    }
  };

  const handleInstallApp = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setInstallPrompt(null);
        toast.success("📲 Uygulama telefonunuza eklendi!");
      }
      return;
    }
    setShowMobileGuide((v) => !v);
  };

  const handleEnableNotifications = async () => {
    if (notifyPerm === "ios-install-needed") {
      setShowMobileGuide(true);
      toast.warning("iPhone'da bildirim almak için önce siteyi Ana Ekrana eklemelisiniz.");
      return;
    }
    const perm = await enableNotifications();
    setNotifyPerm(perm);
    if (perm === "granted") {
      await showSystemNotification(
        "🔔 Pump Radar Mobil & Masaüstü Bildirimleri Aktif",
        "Eşik üstü yeni coinler, +%3/+%5/+%10 yükselişler ve hedef/stop hareketleri anında bildirilecek.",
        "radar-welcome"
      );
      toast.success("Bildirimler etkinleştirildi!");
    } else if (perm === "denied") {
      toast.error("Tarayıcı bildirim izni reddedildi. Adres çubuğundaki site ayarlarından açabilirsiniz.");
    } else if (perm === "unsupported") {
      setShowMobileGuide(true);
    }
  };

  const handleTestNotification = async () => {
    if (!audioRef.current) {
      audioRef.current = new AudioContext();
    }
    const prevSound = soundRef.current;
    soundRef.current = true;
    playTone("good");
    soundRef.current = prevSound;

    const testEv: RadarEvent = {
      id: `test-${Date.now()}`,
      ts: Date.now(),
      type: "alert",
      tone: "good",
      title: "🔔 Test Bildirimi — Sistem Hazır",
      message: "Yeni bir coin eşiği geçtiğinde veya açık alarmlarınız hedefe/stop'a ulaştığında böyle bildirim alacaksınız.",
      notify: true,
    };

    const next = [testEv, ...events].slice(0, MAX_EVENTS);
    setEvents(next);
    saveEvents(next);

    toast.success(testEv.title, { description: testEv.message, duration: 6000 });
    if (notifyPerm === "granted") {
      await showSystemNotification(testEv.title, testEv.message, testEv.id);
    }
  };

  const openChart = (symbol: string) => {
    setSymbol(symbol);
    router.push("/");
  };

  const handleTrackCoin = (coin: RadarCoin) => {
    const ts = Date.now();
    const { history: nextHistory, added } = addManualTrack(history, coin, ts);
    saveHistory(nextHistory);
    setHistory(nextHistory);

    const baseName = coin.symbol.replace("USDT", "");
    if (added) {
      const ev: RadarEvent = {
        id: `track-${coin.id}-${ts}`,
        ts,
        type: "alert",
        tone: "info",
        coinId: coin.id,
        symbol: coin.symbol,
        exchange: coin.exchange,
        title: `🎯 ${baseName} Canlı Hedef Takibine Alındı`,
        message: `Giriş $${fmtPrice(coin.plan.entry)} · Stop $${fmtPrice(coin.plan.stop)} · TP1 $${fmtPrice(coin.plan.tp1)} (+%${coin.plan.tp1Pct.toFixed(1)}) · TP2 $${fmtPrice(coin.plan.tp2)} (+%${coin.plan.tp2Pct.toFixed(1)}). Seviyeler vurulduğunda anında bildirim gönderilecek.`,
        notify: false,
      };
      const nextEvents = [ev, ...events].slice(0, MAX_EVENTS);
      setEvents(nextEvents);
      saveEvents(nextEvents);
    }
    toast.success(`🎯 ${baseName}/USDT canlı takibe alındı!`, {
      description: `TP1 ($${fmtPrice(coin.plan.tp1)}), TP2 ($${fmtPrice(coin.plan.tp2)}) veya Stop ($${fmtPrice(coin.plan.stop)}) seviyesine ulaştığında bildirim alacaksınız.`,
      duration: 6000,
    });
  };

  const handleRemoveTracked = (id: string, ts: number) => {
    const nextHistory = removeTrackedRecord(history, id, ts);
    saveHistory(nextHistory);
    setHistory(nextHistory);
    toast("İşlem canlı takipten çıkarıldı");
  };

  const handleClearHistory = () => {
    clearHistory();
    setHistory([]);
  };

  const handleClearEvents = () => {
    clearEvents();
    setEvents([]);
    setUnreadCount(0);
  };

  const stats = computeStats(history);
  const allCoins = data?.coins ?? [];
  const cleanCoins = allCoins.filter((c) => !c.isBullTrap);
  const microBurstCoins = allCoins.filter((c) => c.isMicroBurst && !c.isBullTrap);
  const squeezeCoins = allCoins.filter((c) => c.isShortSqueeze && !c.isBullTrap);
  const trapCoins = allCoins.filter((c) => c.isBullTrap);

  const displayedCoins =
    filterMode === "micro_burst"
      ? microBurstCoins
      : filterMode === "short_squeeze"
      ? squeezeCoins
      : filterMode === "traps"
      ? trapCoins
      : cleanCoins;

  const openRecords = history.filter((h) => h.status === "open");
  const openIdsSet = new Set(openRecords.map((h) => h.id));
  const latestEvents = events.slice(0, 3);
  const livePricesMap: Record<string, number> = { ...(data?.prices ?? {}) };
  for (const c of allCoins) {
    livePricesMap[c.id] = c.price;
  }

  return (
    <div className="min-h-screen bg-[#08090b] text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-white/5 bg-[#08090b]/90 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Radar size={16} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide">Pump Radar</h1>
            <p className="text-[10px] text-gray-500">Binance + MEXC · 15 dk mum · her 60 sn taranır</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Alarm Eşiği */}
          <div className="flex items-center gap-1 rounded-lg bg-white/5 p-0.5" title="Alarm eşiği">
            {THRESHOLDS.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setThreshold(t);
                  window.localStorage.setItem("radar-threshold", String(t));
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold transition-colors ${
                  threshold === t ? "bg-emerald-500/20 text-emerald-300" : "text-gray-400 hover:text-white"
                }`}
              >
                ≥{t}
              </button>
            ))}
          </div>

          {/* Mobil & Masaüstü Bildirim Butonu */}
          {notifyPerm === "granted" ? (
            <span
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold"
              title="Mobil ve masaüstü bildirimleri açık"
            >
              <BellRing size={13} />
              <span className="hidden sm:inline">Bildirim Açık</span>
            </span>
          ) : notifyPerm === "denied" ? (
            <span
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs"
              title="Tarayıcı ayarlarından bildirim izni verin"
            >
              <BellOff size={13} />
              <span className="hidden sm:inline">İzin Engelli</span>
            </span>
          ) : notifyPerm === "ios-install-needed" ? (
            <button
              onClick={() => setShowMobileGuide((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-xs font-semibold transition-colors"
              title="iPhone'da bildirim almak için Ana Ekrana Ekle"
            >
              <Smartphone size={13} />
              <span>iPhone Bildirim Kurulumu</span>
            </button>
          ) : (
            <button
              onClick={() => void handleEnableNotifications()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 text-xs font-semibold transition-colors"
              title="Mobil ve masaüstü bildirimlerini etkinleştir"
            >
              <Bell size={13} />
              <span>Bildirimleri Aç</span>
            </button>
          )}

          {/* Ekranı Açık Tut (Mobil Wake Lock) */}
          {platform.wakeLockSupported && (
            <button
              onClick={() => void toggleWakeLock()}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                wakeLockOn
                  ? "bg-cyan-500/20 border border-cyan-500/30 text-cyan-300"
                  : "bg-white/5 text-gray-400 hover:text-white"
              }`}
              title="Telefon ekranının kapanmasını engeller"
            >
              <Sun size={13} />
              <span className="hidden md:inline">{wakeLockOn ? "Ekran Açık" : "Uyanık Tut"}</span>
            </button>
          )}

          {/* Telefona Uygulama Olarak Yükle / Mobil Rehber */}
          {(installPrompt || !platform.isStandalone) && (
            <button
              onClick={() => void handleInstallApp()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 transition-colors"
              title="Telefon ana ekranına uygulama olarak yükle"
            >
              <Download size={12} />
              <span className="hidden sm:inline">{installPrompt ? "Uygulamayı Yükle" : "Mobil Kurulum"}</span>
            </button>
          )}

          {/* Sesli Uyarı Butonu */}
          <button
            onClick={toggleSound}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              soundOn
                ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300"
                : "bg-white/5 text-gray-400 hover:text-white"
            }`}
            title={soundOn ? "Sesli alarm açık" : "Sesli alarm kapalı"}
          >
            {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span className="hidden md:inline">{soundOn ? "Ses Açık" : "Ses Kapalı"}</span>
          </button>

          {/* Test Bildirimi */}
          <button
            onClick={() => void handleTestNotification()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 transition-colors"
            title="Örnek ses ve bildirim gönder"
          >
            <Send size={12} />
            <span className="hidden sm:inline">Test Et</span>
          </button>

          {/* Yenile */}
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 text-xs text-gray-300 transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Yenile
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-5 pb-20 sm:pb-6 flex flex-col gap-5">
        {/* Mobil Bildirim & Kurulum Rehberi Kartı */}
        {(showMobileGuide || notifyPerm === "ios-install-needed" || (platform.isMobile && notifyPerm === "default")) && (
          <section className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-950/30 via-[#0d0e12] to-[#0d0e12] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                <Smartphone size={15} />
                <span>TELEFONDA CANLI BİLDİRİM ALMA REHBERİ (ANDROID & iPHONE)</span>
              </div>
              {showMobileGuide && (
                <button
                  onClick={() => setShowMobileGuide(false)}
                  className="text-[11px] text-gray-400 hover:text-white"
                >
                  Kapat ✕
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-300">
              <div className="rounded-xl bg-black/40 border border-white/5 p-3 flex flex-col gap-1.5">
                <span className="font-bold text-emerald-300">🤖 Android (Chrome / Samsung / Edge)</span>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  1. Yukarıdaki <b>&quot;Bildirimleri Aç&quot;</b> butonuna dokunun ve çıkan izne <b>İzin Ver</b> deyin.
                  <br />
                  2. İsterseniz <b>&quot;Uygulamayı Yükle&quot;</b> (veya tarayıcı menüsünden <i>Ana ekrana ekle</i>) ile tam ekran uygulama gibi kullanın; bildirimler titreşimli olarak düşer.
                </p>
                {notifyPerm === "default" && (
                  <button
                    onClick={() => void handleEnableNotifications()}
                    className="mt-1 self-start px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold text-[11px]"
                  >
                    🔔 Şimdi Bildirim İznini Aç
                  </button>
                )}
              </div>

              <div className="rounded-xl bg-black/40 border border-white/5 p-3 flex flex-col gap-1.5">
                <span className="font-bold text-sky-300">🍏 iPhone / iPad (Safari iOS 16.4+)</span>
                <p className="text-[11px] text-gray-300 leading-relaxed">
                  Apple güvenlik kuralı gereği Safari&apos;de web bildirimleri yalnızca site Ana Ekrana eklendiğinde çalışır:
                  <br />
                  1. Safari alt barındaki <b>Paylaş (⬆️)</b> simgesine dokunun.
                  <br />
                  2. <b>&quot;Ana Ekrana Ekle&quot;</b> seçeneğine basın.
                  <br />
                  3. Ana ekranınıza gelen <b>Pump Radar</b> ikonundan uygulamayı açıp <b>&quot;Bildirimleri Aç&quot;</b> butonuna dokunun.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Özellik 4: Canlı BTC Tehlike Kalkanı */}
        {data?.btcShield && <BtcShieldBanner shield={data.btcShield} />}

        {/* Özellik 1: Aktif Takip Edilen İşlemlerim (Canlı TP1 / TP2 / Stop İzleyici) */}
        <ActiveTrackedPanel
          records={openRecords}
          prices={livePricesMap}
          onRemove={handleRemoveTracked}
          onOpenChart={openChart}
        />

        {/* Canlı Olan Biten Şeridi */}
        <section className="rounded-2xl border border-white/10 bg-[#0d0e12] p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <Activity size={14} className="text-emerald-400" />
              <span>CANLI OLAN BİTEN AKIŞI</span>
              <span className="text-[10px] font-normal text-gray-400">
                (Yeni alarmlar, +%3/+%5/+%10 yükselişler, hedef/stop vuruşları ve skor sıçramaları)
              </span>
            </div>
            <button
              onClick={() => {
                setTab("events");
                setUnreadCount(0);
              }}
              className="text-[11px] text-emerald-400 hover:underline font-semibold"
            >
              Tümünü Gör ({events.length}) →
            </button>
          </div>

          {latestEvents.length === 0 ? (
            <div className="text-xs text-gray-500 py-1">
              İlk tarama bekleniyor… Olaylar gerçekleştiğinde anında burada listelenir ve bildirim gönderilir.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {latestEvents.map((ev) => {
                const style = EVENT_TONE_STYLE[ev.tone];
                return (
                  <div
                    key={ev.id}
                    className={`rounded-xl border p-2.5 flex flex-col gap-1 ${style.border}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-white truncate">{ev.title}</span>
                      <span className="text-[9px] font-mono text-gray-400 flex-none">{timeAgo(ev.ts, now)}</span>
                    </div>
                    <p className="text-[11px] text-gray-300 line-clamp-2 leading-snug">{ev.message}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Nasıl çalışır */}
        <section className="rounded-2xl border border-emerald-400/15 bg-gradient-to-br from-emerald-950/30 to-transparent p-4 text-[12px] leading-relaxed text-gray-300">
          <div className="flex items-center gap-2 font-semibold text-emerald-300 mb-1">
            <Target size={14} /> Nasıl okunur?
          </div>
          Skor yüksek = <b>hacim artmış ama fiyat henüz az oynamış</b> (birikim), bantlar sıkışmış, alıcılar baskın, emir defterinde
          alış duvarı var. Pump başlamış (1 saatte &gt;%8, 4 saatte &gt;%15, 24 saatte &gt;%30) coinler <b>otomatik elenir</b> —
          geç kalınan hareketi kovalamamak için. Stop/hedefler son 12 mumun dibine göre hesaplanır (1:2 ve 1:3.5 risk/ödül).
          <div className="mt-2 text-[11px] text-amber-300/80">
            ⚠ Bu bir yatırım tavsiyesi değildir; sinyaller tutmayabilir. Sermayenin küçük bir kısmıyla gir, stop&apos;u mutlaka koy.
            Gerçek isabet oranını &quot;Alarm Geçmişi&quot; sekmesinden kendi verinle ölç.
          </div>
        </section>

        {/* İstatistikler */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Taranan coin" value={data ? String(data.scanned) : "—"} sub="Binance + MEXC" />
          <StatCard
            label="Elenen (geç)"
            value={data ? String(data.lateCount) : "—"}
            sub="Pump zaten olmuş"
            tone="text-gray-300"
          />
          <StatCard
            label="Temiz Aday"
            value={String(cleanCoins.length)}
            sub={`${cleanCoins.filter((c) => c.score >= threshold).length} adet ≥${threshold} · ${trapCoins.length} tuzak elendi`}
            tone="text-emerald-400"
          />
          <StatCard
            label="İsabet (Hedef 1)"
            value={stats.hitRate === null ? "—" : `%${stats.hitRate.toFixed(0)}`}
            sub={`${stats.tp1} hedef · ${stats.stop} stop · ${stats.timeout} süre`}
            tone={stats.hitRate !== null && stats.hitRate >= 40 ? "text-emerald-400" : "text-white"}
          />
          <StatCard
            label="Ort. K/Z"
            value={stats.avgPnl === null ? "—" : fmtPct(stats.avgPnl)}
            sub={`${stats.open} açık takip`}
            tone={stats.avgPnl === null ? "text-white" : stats.avgPnl >= 0 ? "text-emerald-400" : "text-rose-400"}
          />
        </section>

        {/* Sekmeler */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-1 rounded-xl bg-white/5 p-1">
            <button
              onClick={() => setTab("radar")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === "radar" ? "bg-emerald-500/20 text-emerald-300" : "text-gray-400 hover:text-white"
              }`}
            >
              <Flame size={12} /> Radar ({cleanCoins.length})
            </button>
            <button
              onClick={() => {
                setTab("events");
                setUnreadCount(0);
              }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === "events" ? "bg-emerald-500/20 text-emerald-300" : "text-gray-400 hover:text-white"
              }`}
            >
              <BellRing size={12} /> Olan Biten ({events.length})
              {unreadCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-400 text-black text-[10px] font-extrabold">
                  +{unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("history")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === "history" ? "bg-emerald-500/20 text-emerald-300" : "text-gray-400 hover:text-white"
              }`}
            >
              <Clock size={12} /> Alarm Geçmişi ({history.length})
            </button>
          </div>

          {tab === "history" && history.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-rose-400 transition-colors"
            >
              <Trash2 size={12} /> Alarm geçmişini temizle
            </button>
          )}
          {tab === "events" && events.length > 0 && (
            <button
              onClick={handleClearEvents}
              className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-rose-400 transition-colors"
            >
              <Trash2 size={12} /> Akışı temizle
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3 text-xs text-rose-300">{error}</div>
        )}

        {data && !data.sources.binance && !data.sources.mexc && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-300">
            Borsa verilerine şu an ulaşılamıyor. Son bilinen veri gösteriliyor olabilir.
          </div>
        )}

        {tab === "radar" ? (
          <>
            {/* Hızlı Strateji Filtreleri (Özellik 2, 3, 4) */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setFilterMode("clean")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  filterMode === "clean"
                    ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-200"
                    : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                <Flame size={12} /> Temiz Birikim ({cleanCoins.length})
              </button>

              <button
                onClick={() => setFilterMode("micro_burst")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  filterMode === "micro_burst"
                    ? "bg-amber-500/20 border-amber-400/50 text-amber-200"
                    : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                <Zap size={12} /> ⚡ 15dk Sıcak Para ({microBurstCoins.length})
              </button>

              <button
                onClick={() => setFilterMode("short_squeeze")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  filterMode === "short_squeeze"
                    ? "bg-violet-500/20 border-violet-400/50 text-violet-200"
                    : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                }`}
              >
                🧨 Short Squeeze Adayları ({squeezeCoins.length})
              </button>

              <button
                onClick={() => setFilterMode("traps")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  filterMode === "traps"
                    ? "bg-rose-500/20 border-rose-400/50 text-rose-200"
                    : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                }`}
                title="CVD uyumsuzluğu, ağır satış duvarı veya üst fitil reddi nedeniyle elenen sahte yükselişler"
              >
                <ShieldAlert size={12} /> 🛡️ Yakalanan Tuzaklar ({trapCoins.length})
              </button>
            </div>

            {loading && !data ? (
              <div className="rounded-2xl border border-white/5 bg-[#0d0e12] p-12 flex flex-col items-center gap-3 text-sm text-gray-400">
                <Loader2 className="animate-spin text-emerald-400" />
                Yaklaşık 120 coin taranıyor (ilk tarama birkaç saniye sürer)…
              </div>
            ) : displayedCoins.length === 0 ? (
              <div className="rounded-2xl border border-white/5 bg-[#0d0e12] p-12 text-center text-sm text-gray-400">
                {filterMode === "micro_burst"
                  ? "Şu an son 15 dakikada ani sıcak para patlaması yapan coin yok."
                  : filterMode === "short_squeeze"
                  ? "Şu an negatif fonlama + spot alıcı sıkışması gösteren Short Squeeze adayı yok."
                  : filterMode === "traps"
                  ? "Şu an tespit edilen sahte pump / dağıtım tuzağı yok."
                  : "Şu an anlamlı birikim sinyali veren coin yok. Piyasa sakin olabilir — radar her 60 saniyede yeniden tarar."}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {displayedCoins.map((c, i) => (
                  <CoinCard
                    key={c.id}
                    coin={c}
                    rank={i + 1}
                    isTracked={openIdsSet.has(c.id)}
                    onTrack={handleTrackCoin}
                    onOpenChart={openChart}
                  />
                ))}
              </div>
            )}
          </>
        ) : tab === "events" ? (
          <EventFeedList events={events} now={now} onOpenChart={openChart} />
        ) : (
          <HistoryList history={history} now={now} />
        )}

        {data && (
          <p className="text-[10px] text-gray-600 text-center font-mono">
            Son tarama: {new Date(data.generatedAt).toLocaleTimeString("tr-TR")} · Funding verisi:{" "}
            {data.sources.futures ? "aktif" : "yok"} · Fiyat takibi ~60 sn aralıkla örneklenir
          </p>
        )}
      </main>

      {/* Mobil Alt Navigasyon Barı */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-xl border-t border-white/10 flex items-center justify-around py-2 px-1 safe-area-bottom">
        <Link href="/" className="flex flex-col items-center gap-0.5 text-gray-400 hover:text-white transition-colors">
          <Home size={18} />
          <span className="text-[9px] font-semibold">Ana Sayfa</span>
        </Link>
        <div className="flex flex-col items-center gap-0.5 text-emerald-400">
          <Radar size={18} />
          <span className="text-[9px] font-semibold">Pump Radar</span>
        </div>
        <Link href="/screener" className="flex flex-col items-center gap-0.5 text-gray-400 hover:text-white transition-colors">
          <LayoutGrid size={18} />
          <span className="text-[9px] font-semibold">Küp Ekran</span>
        </Link>
        <Link href="/mexc" className="flex flex-col items-center gap-0.5 text-gray-400 hover:text-white transition-colors">
          <Coins size={18} />
          <span className="text-[9px] font-semibold">MEXC</span>
        </Link>
      </nav>
    </div>
  );
}
