"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Sparkles,
  RefreshCw,
  Settings,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Activity,
  Key,
  Check,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { useDashboardStore } from "@/lib/store";
import { formatNumber } from "@/lib/utils";
import type { AiAnalysisResponse } from "@/app/api/ai/analyze/route";

export default function AiCopilot() {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const activeInterval = useDashboardStore((s) => s.activeInterval);
  const signalData = useDashboardStore((s) => s.signalData);
  const candles = useDashboardStore((s) => s.candles);

  const [analysis, setAnalysis] = useState<AiAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isExecuted, setIsExecuted] = useState(false);

  // Track last fetched timestamp and symbol to prevent rapid refetches
  const lastFetchRef = useRef<{ symbol: string; time: number }>({ symbol: "", time: 0 });
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load custom Gemini API Key from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("gemini_api_key");
    if (saved) {
      setGeminiKey(saved);
      setKeyInput(saved);
    }
  }, []);

  const saveApiKey = () => {
    const trimmed = keyInput.trim();
    if (trimmed) {
      localStorage.setItem("gemini_api_key", trimmed);
      setGeminiKey(trimmed);
    } else {
      localStorage.removeItem("gemini_api_key");
      setGeminiKey("");
    }
    setKeySaved(true);
    setTimeout(() => {
      setKeySaved(false);
      setShowSettings(false);
    }, 1200);
    // Trigger fresh analysis with new key
    fetchAnalysis(true);
  };

  const fetchAnalysis = useCallback(
    async (force = false) => {
      if (!signalData && candles.length === 0) return;

      const currentPrice = signalData?.price || candles[candles.length - 1]?.close || 0;
      if (currentPrice <= 0) return;

      const now = Date.now();
      // Throttle: avoid re-fetching the same symbol within 12 seconds unless forced
      if (!force && lastFetchRef.current.symbol === activeSymbol && now - lastFetchRef.current.time < 12_000) {
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      lastFetchRef.current = { symbol: activeSymbol, time: now };

      const ind = signalData?.indicators;
      const lastCandle = candles[candles.length - 1];

      const payload = {
        symbol: activeSymbol,
        interval: activeInterval,
        price: currentPrice,
        change24h: candles.length >= 2
          ? ((currentPrice - candles[0].close) / candles[0].close) * 100
          : 0,
        signalScore: signalData?.score ?? 50,
        signalLabel: signalData?.label ?? "NÖTR",
        indicators: {
          rsi: ind?.rsi ?? null,
          macd: ind?.macd_trend ? (ind.macd_trend === "bullish" ? 1 : -1) : null,
          macdSignal: ind?.macd_signal ?? null,
          macdHist: ind?.macd_histogram ?? null,
          bbUpper: ind?.bb_upper ?? null,
          bbMiddle: ind?.bb_middle ?? null,
          bbLower: ind?.bb_lower ?? null,
          vwap: ind?.vwap ?? null,
          ema20: ind?.ema_20 ?? null,
          ema50: ind?.ema_50 ?? null,
          ema200: ind?.ema_200 ?? null,
        },
        volume24h: lastCandle?.volume ?? 0,
      };

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const activeKey = geminiKey || (typeof window !== "undefined" ? localStorage.getItem("gemini_api_key") || "" : "");
        if (activeKey) {
          headers["x-gemini-key"] = activeKey;
        }

        const res = await fetch("/api/ai/analyze", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}`);
        }

        const data = (await res.json()) as AiAnalysisResponse;
        setAnalysis(data);
        setIsExecuted(false);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.warn("[AiCopilot] Fetch error, using local fallback:", err);
        }
      } finally {
        setLoading(false);
      }
    },
    [activeSymbol, activeInterval, signalData, candles, geminiKey]
  );

  // Auto-analyze on symbol switch or first load
  useEffect(() => {
    fetchAnalysis();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchAnalysis]);

  if (!analysis) {
    return (
      <div className="w-full bg-[#0d0e12] border border-white/10 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 text-center min-h-[220px]">
        <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
        <div className="text-sm font-semibold text-white">Yapay Zeka Analizi Hazırlanıyor</div>
        <p className="text-xs text-gray-400 max-w-xs">
          {activeSymbol} teknik indikatörleri ve emir defteri verileri değerlendiriliyor...
        </p>
      </div>
    );
  }

  // Theme palettes based on sentiment
  const theme = {
    bullish: {
      border: "border-emerald-500/30",
      bgGlow: "from-emerald-950/40 via-[#0d1410] to-[#08090b]",
      pill: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400",
      accent: "text-emerald-400",
      bar: "from-emerald-500 to-teal-400",
      btn: "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black font-extrabold shadow-[0_0_20px_rgba(16,185,129,0.3)]",
      actionText: "LONG POZİSYON AÇ",
      tag: "BOĞA MOMENTUMU",
    },
    bearish: {
      border: "border-rose-500/30",
      bgGlow: "from-rose-950/40 via-[#140d0f] to-[#08090b]",
      pill: "bg-rose-500/15 border-rose-500/40 text-rose-400",
      accent: "text-rose-400",
      bar: "from-rose-500 to-red-400",
      btn: "bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-extrabold shadow-[0_0_20px_rgba(244,63,94,0.3)]",
      actionText: "SHORT POZİSYON AÇ",
      tag: "AYI BASKISI",
    },
    warning: {
      border: "border-amber-500/30",
      bgGlow: "from-amber-950/40 via-[#14120d] to-[#08090b]",
      pill: "bg-amber-500/15 border-amber-500/40 text-amber-400",
      accent: "text-amber-400",
      bar: "from-amber-500 to-yellow-400",
      btn: "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold shadow-[0_0_20px_rgba(245,158,11,0.3)]",
      actionText: "KÂR AL / ÇIKIŞ YAP",
      tag: "AŞIRI ŞİŞKİN (DİKKAT)",
    },
    neutral: {
      border: "border-indigo-500/30",
      bgGlow: "from-indigo-950/40 via-[#0d0e17] to-[#08090b]",
      pill: "bg-indigo-500/15 border-indigo-500/40 text-indigo-400",
      accent: "text-indigo-400",
      bar: "from-indigo-500 to-blue-400",
      btn: "bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-extrabold shadow-[0_0_20px_rgba(99,102,241,0.3)]",
      actionText: "KIRILIMI BEKLE",
      tag: "KONSOLİDASYON",
    },
  }[analysis.sentiment];

  return (
    <div
      className={`w-full bg-gradient-to-b ${theme.bgGlow} border ${theme.border} rounded-2xl p-4 flex flex-col gap-3.5 shadow-2xl transition-all duration-300 font-sans`}
    >
      {/* ── Top Header ── */}
      <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400 shadow-inner">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white tracking-wide font-sora">
                AI MARKET COPILOT
              </span>
              {analysis.source === "gemini" ? (
                <span className="bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded">
                  GEMINI 2.5
                </span>
              ) : (
                <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[9px] font-mono font-bold px-1.5 py-0.2 rounded">
                  QUANT
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 font-mono">
              {analysis.symbol} • {activeInterval} döngüsü
            </p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => fetchAnalysis(true)}
            disabled={loading}
            title="Analizi Yenile"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            title="Gemini API Ayarları"
            className={`p-1.5 rounded-lg transition-all ${
              geminiKey
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                : "bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Optional Gemini API Key Drawer ── */}
      {showSettings && (
        <div className="bg-[#0b0c10] border border-white/10 rounded-xl p-3 flex flex-col gap-2.5 text-xs animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-purple-400" /> Google Gemini API Anahtarı
            </span>
            <a
              href="https://aistudio.google.com/"
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-purple-400 hover:underline flex items-center gap-0.5"
            >
              Ücretsiz Key Al <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Google Gemini 2.5 Flash ile gerçek zamanlı derin analizler üretmek için API anahtarınızı ekleyin.
            Boş bırakırsanız yüksek frekanslı kantitatif analiz motoru çalışır.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="AIzaSy..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="flex-1 bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-500 font-mono focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={saveApiKey}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all"
            >
              {keySaved ? <Check className="w-3.5 h-3.5" /> : "Kaydet"}
            </button>
          </div>
        </div>
      )}

      {/* ── Sentiment & Confidence Bar ── */}
      <div className="flex items-center justify-between gap-3 bg-black/30 border border-white/5 rounded-xl p-2.5">
        <div className="flex items-center gap-2">
          {analysis.sentiment === "bullish" && <TrendingUp className="w-4 h-4 text-emerald-400" />}
          {analysis.sentiment === "bearish" && <TrendingDown className="w-4 h-4 text-rose-400" />}
          {analysis.sentiment === "warning" && <AlertTriangle className="w-4 h-4 text-amber-400" />}
          {analysis.sentiment === "neutral" && <Activity className="w-4 h-4 text-indigo-400" />}
          <span className={`text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md border ${theme.pill}`}>
            {theme.tag}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 uppercase font-mono">Güven</span>
          <div className="w-16 h-2 rounded-full bg-black/60 overflow-hidden border border-white/10">
            <div
              className={`h-full bg-gradient-to-r ${theme.bar} transition-all duration-700`}
              style={{ width: `${analysis.confidence}%` }}
            />
          </div>
          <span className={`text-xs font-mono font-bold ${theme.accent}`}>
            %{analysis.confidence}
          </span>
        </div>
      </div>

      {/* ── Headline & Narrative Summary ── */}
      <div className="flex flex-col gap-1.5">
        <h4 className="text-xs font-bold text-white tracking-tight flex items-center gap-1.5 font-sora">
          {analysis.headline}
        </h4>
        <p className="text-[11px] leading-relaxed text-gray-300 font-normal">
          {analysis.summary}
        </p>
      </div>

      {/* ── Institutional Trade Plan (Entry, TP, SL, R:R) ── */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-400 uppercase font-mono">Giriş Seviyesi</span>
          <span className="font-mono font-bold text-white text-xs">
            ${formatNumber(analysis.tradePlan.entry, 4)}
          </span>
        </div>

        <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-400 uppercase font-mono">Zarar Durdur (SL)</span>
          <span className="font-mono font-bold text-rose-400 text-xs">
            ${formatNumber(analysis.tradePlan.stopLoss, 4)}
          </span>
        </div>

        <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-400 uppercase font-mono">Hedef 1 (TP1)</span>
          <span className="font-mono font-bold text-emerald-400 text-xs">
            ${formatNumber(analysis.tradePlan.tp1, 4)}
          </span>
        </div>

        <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-400 uppercase font-mono">Risk / Ödül (R:R)</span>
          <span className="font-mono font-bold text-cyan-300 text-xs">
            {analysis.tradePlan.riskReward}
          </span>
        </div>
      </div>

      {/* ── Key Levels Mini Row ── */}
      <div className="flex items-center justify-between text-[10px] font-mono bg-black/20 border border-white/5 rounded-lg px-2.5 py-1.5 text-gray-400">
        <div>
          <span>Destek: </span>
          <span className="text-white font-semibold">${formatNumber(analysis.keyLevels.support, 2)}</span>
        </div>
        <div>
          <span>Direnç: </span>
          <span className="text-white font-semibold">${formatNumber(analysis.keyLevels.resistance, 2)}</span>
        </div>
        <div>
          <span>Stop İhlal: </span>
          <span className="text-amber-400 font-semibold">${formatNumber(analysis.keyLevels.invalidation, 2)}</span>
        </div>
      </div>

      {/* ── Indicator Health Status ── */}
      <div className="grid grid-cols-3 gap-1.5 text-[9px] font-mono text-center">
        <div className="bg-white/5 rounded-md py-1 px-1.5 text-gray-300">
          <span className="text-gray-500 block">RSI</span>
          <span className="text-white font-semibold">{analysis.indicatorsSummary.rsiStatus}</span>
        </div>
        <div className="bg-white/5 rounded-md py-1 px-1.5 text-gray-300">
          <span className="text-gray-500 block">TREND</span>
          <span className="text-white font-semibold">{analysis.indicatorsSummary.trendStatus}</span>
        </div>
        <div className="bg-white/5 rounded-md py-1 px-1.5 text-gray-300">
          <span className="text-gray-500 block">VOLATİLİTE</span>
          <span className="text-white font-semibold">{analysis.indicatorsSummary.volatilityStatus}</span>
        </div>
      </div>

      {/* ── Action Button & Confirmation ── */}
      <div className="mt-1 flex flex-col gap-2">
        {!confirmOpen && !isExecuted && (
          <button
            onClick={() => setConfirmOpen(true)}
            className={`w-full py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-all transform active:scale-98 ${theme.btn}`}
          >
            {theme.actionText}
          </button>
        )}

        {confirmOpen && (
          <div className="flex items-center justify-between gap-2 bg-black/60 border border-white/10 rounded-xl p-2.5 text-xs">
            <span className="text-gray-300 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> İşlemi onayla?
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  setIsExecuted(true);
                }}
                className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-3 py-1 rounded-lg text-xs transition-all"
              >
                Evet
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                className="bg-white/10 hover:bg-white/15 text-white font-semibold px-2.5 py-1 rounded-lg text-xs transition-all"
              >
                İptal
              </button>
            </div>
          </div>
        )}

        {isExecuted && (
          <div className="w-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl p-2 text-center text-xs font-semibold flex items-center justify-center gap-1.5 animate-fadeIn">
            <Check className="w-3.5 h-3.5" /> İşlem simülasyonu sisteme kaydedildi.
          </div>
        )}
      </div>
    </div>
  );
}
