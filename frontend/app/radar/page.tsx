"use client";

// Pump Radar — grafik okumadan, tek bir skorlu listeyle "pump başlamadan önce" birikim yapan coinleri yakala.
// Skor: hacim sıçraması + erken evre + Bollinger sıkışması + alıcı baskısı + emir defteri + funding.

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
  Target,
  Trash2,
  LineChart,
  Clock,
  Flame,
} from "lucide-react";
import { useDashboardStore } from "@/lib/store";
import type { RadarCoin, RadarPayload, ScoreBreakdown } from "@/lib/pumpRadar";
import {
  addAlerts,
  clearHistory,
  computeStats,
  evaluateHistory,
  loadHistory,
  saveHistory,
  type AlertStatus,
  type RadarAlertRecord,
} from "@/lib/radarHistory";

const REFRESH_MS = 60_000;
const THRESHOLDS = [60, 70, 80] as const;

// ── Biçimlendirme ─────────────────────────────────────────────────────────────
function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toPrecision(4);
}

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

function CoinCard({
  coin,
  rank,
  onOpenChart,
}: {
  coin: RadarCoin;
  rank: number;
  onOpenChart: (symbol: string) => void;
}) {
  const tone = scoreTone(coin.score);
  const base = coin.symbol.replace("USDT", "");
  return (
    <article className="rounded-2xl border border-white/5 bg-[#0d0e12] p-4 flex flex-col gap-3 hover:border-white/15 transition-colors">
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
          </div>
          <div className="mt-1 flex items-baseline gap-3 font-mono text-xs text-gray-400 flex-wrap">
            <span className="text-white font-semibold">${fmtPrice(coin.price)}</span>
            <span className={coin.change1h >= 0 ? "text-emerald-400" : "text-rose-400"}>1s {fmtPct(coin.change1h)}</span>
            <span className={coin.change4h >= 0 ? "text-emerald-400" : "text-rose-400"}>4s {fmtPct(coin.change4h)}</span>
            <span className={coin.change24h >= 0 ? "text-emerald-400" : "text-rose-400"}>24s {fmtPct(coin.change24h)}</span>
            <span className="text-gray-500">Hacim {fmtUsd(coin.volume24hUsd)}</span>
          </div>
        </div>

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

      {/* İşlem planı */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
        <div className="rounded-lg bg-black/40 border border-white/5 px-2.5 py-2">
          <div className="text-[9px] uppercase text-gray-500 font-sans">Giriş</div>
          <div className="text-white font-semibold">${fmtPrice(coin.plan.entry)}</div>
        </div>
        <div className="rounded-lg bg-black/40 border border-white/5 px-2.5 py-2">
          <div className="text-[9px] uppercase text-gray-500 font-sans">Stop (-%{coin.plan.riskPct.toFixed(1)})</div>
          <div className="text-rose-400 font-semibold">${fmtPrice(coin.plan.stop)}</div>
        </div>
        <div className="rounded-lg bg-black/40 border border-white/5 px-2.5 py-2">
          <div className="text-[9px] uppercase text-gray-500 font-sans">Hedef 1 (2R)</div>
          <div className="text-emerald-400 font-semibold">${fmtPrice(coin.plan.tp1)}</div>
        </div>
        <div className="rounded-lg bg-black/40 border border-white/5 px-2.5 py-2">
          <div className="text-[9px] uppercase text-gray-500 font-sans">Hedef 2 (3.5R)</div>
          <div className="text-emerald-300 font-semibold">${fmtPrice(coin.plan.tp2)}</div>
        </div>
      </div>

      {coin.risks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {coin.risks.map((r) => (
            <span
              key={r}
              className="flex items-center gap-1 text-[10px] text-amber-300/90 bg-amber-400/5 border border-amber-400/20 rounded-md px-2 py-1"
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

// ── Sayfa ─────────────────────────────────────────────────────────────────────
export default function RadarPage() {
  const router = useRouter();
  const setSymbol = useDashboardStore((s) => s.setSymbol);

  const [data, setData] = useState<RadarPayload | null>(null);
  const [history, setHistory] = useState<RadarAlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"radar" | "history">("radar");
  const [threshold, setThreshold] = useState<number>(70);
  const [soundOn, setSoundOn] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const thresholdRef = useRef(threshold);
  const soundRef = useRef(soundOn);
  const audioRef = useRef<AudioContext | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    thresholdRef.current = threshold;
  }, [threshold]);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  const beep = useCallback(() => {
    const ctx = audioRef.current;
    if (!ctx || !soundRef.current) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  }, []);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    const stored = loadHistory();
    const openIds = stored.filter((h) => h.status === "open").map((h) => h.id);
    const url = `/api/market/pump-radar${openIds.length ? `?track=${encodeURIComponent(openIds.join(","))}` : ""}`;

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as RadarPayload;
      const ts = Date.now();

      const evaluated = evaluateHistory(stored, payload.prices ?? {}, ts);
      const { history: next, fresh } = addAlerts(evaluated, payload.coins, thresholdRef.current, ts);
      saveHistory(next);

      setHistory(next);
      setData(payload);
      setNow(ts);
      setError(null);

      if (fresh.length > 0) {
        beep();
        fresh.slice(0, 3).forEach((c) => {
          toast.success(`🚀 ${c.symbol.replace("USDT", "")} — Radar skoru ${c.score}`, {
            description: c.reasons[0] ?? "Birikim işaretleri güçlü",
            duration: 12000,
          });
        });
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError("Radar verisi alınamadı. Birkaç saniye sonra otomatik yeniden denenecek.");
    } finally {
      setLoading(false);
    }
  }, [beep]);

  // Kayıtlı ayarları yükle + 60 sn'lik tarama döngüsü
  useEffect(() => {
    const savedThreshold = Number(window.localStorage.getItem("radar-threshold"));
    if (THRESHOLDS.includes(savedThreshold as (typeof THRESHOLDS)[number])) setThreshold(savedThreshold);

    refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    return () => {
      clearInterval(interval);
      clearInterval(tick);
      abortRef.current?.abort();
    };
  }, [refresh]);

  const toggleSound = () => {
    if (!soundOn && !audioRef.current) {
      // AudioContext kullanıcı etkileşimiyle oluşturulmalı
      audioRef.current = new AudioContext();
    }
    setSoundOn((v) => !v);
  };

  const openChart = (symbol: string) => {
    setSymbol(symbol);
    router.push("/");
  };

  const handleClear = () => {
    clearHistory();
    setHistory([]);
  };

  const stats = computeStats(history);
  const coins = data?.coins ?? [];

  return (
    <div className="min-h-screen bg-[#08090b] text-white">
      {/* Header */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-white/5 bg-[#08090b]/90 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
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

        <div className="flex items-center gap-2">
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
          <button
            onClick={toggleSound}
            className={`p-2 rounded-lg transition-colors ${
              soundOn ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-gray-400 hover:text-white"
            }`}
            title={soundOn ? "Sesli alarm açık" : "Sesli alarm kapalı"}
          >
            {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 text-xs text-gray-300 transition-colors"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Yenile
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-6 py-5 flex flex-col gap-5">
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
          <StatCard label="Listede" value={String(coins.length)} sub={`${coins.filter((c) => c.score >= threshold).length} adet ≥${threshold}`} tone="text-emerald-400" />
          <StatCard
            label="İsabet (Hedef 1)"
            value={stats.hitRate === null ? "—" : `%${stats.hitRate.toFixed(0)}`}
            sub={`${stats.tp1} hedef · ${stats.stop} stop · ${stats.timeout} süre`}
            tone={stats.hitRate !== null && stats.hitRate >= 40 ? "text-emerald-400" : "text-white"}
          />
          <StatCard
            label="Ort. K/Z"
            value={stats.avgPnl === null ? "—" : fmtPct(stats.avgPnl)}
            sub={`${stats.open} açık alarm`}
            tone={stats.avgPnl === null ? "text-white" : stats.avgPnl >= 0 ? "text-emerald-400" : "text-rose-400"}
          />
        </section>

        {/* Sekmeler */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 rounded-xl bg-white/5 p-1">
            <button
              onClick={() => setTab("radar")}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === "radar" ? "bg-emerald-500/20 text-emerald-300" : "text-gray-400 hover:text-white"
              }`}
            >
              <Flame size={12} /> Radar
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
              onClick={handleClear}
              className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-rose-400 transition-colors"
            >
              <Trash2 size={12} /> Geçmişi temizle
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
          loading && !data ? (
            <div className="rounded-2xl border border-white/5 bg-[#0d0e12] p-12 flex flex-col items-center gap-3 text-sm text-gray-400">
              <Loader2 className="animate-spin text-emerald-400" />
              Yaklaşık 120 coin taranıyor (ilk tarama birkaç saniye sürer)…
            </div>
          ) : coins.length === 0 ? (
            <div className="rounded-2xl border border-white/5 bg-[#0d0e12] p-12 text-center text-sm text-gray-400">
              Şu an anlamlı birikim sinyali veren coin yok. Piyasa sakin olabilir — radar her 60 saniyede yeniden tarar.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {coins.map((c, i) => (
                <CoinCard key={c.id} coin={c} rank={i + 1} onOpenChart={openChart} />
              ))}
            </div>
          )
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
    </div>
  );
}
