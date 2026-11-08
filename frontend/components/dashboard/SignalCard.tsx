"use client";

import { useEffect, useState } from "react";
import { useDashboardStore } from "@/lib/store";
import { getSignalLevel, type CandleData } from "@/lib/utils";
import { buildSignalPayloadFromCandles } from "@/lib/indicators";
import { TrendingUp, TrendingDown, Minus, HelpCircle, Compass } from "lucide-react";

const MTF_INTERVALS = ["1m", "5m", "15m", "1h", "4h"] as const;

interface MtfItem {
  interval: string;
  score: number;
  shortLabel: "GÜÇLÜ AL" | "AL" | "NÖTR" | "SAT";
  tone: "pos" | "neu" | "neg";
}

function classifyScore(score: number): { shortLabel: MtfItem["shortLabel"]; tone: MtfItem["tone"] } {
  const level = getSignalLevel(score);
  if (level === "strong_buy") return { shortLabel: "GÜÇLÜ AL", tone: "pos" };
  if (level === "buy") return { shortLabel: "AL", tone: "pos" };
  if (level === "sell") return { shortLabel: "SAT", tone: "neg" };
  return { shortLabel: "NÖTR", tone: "neu" };
}

export default function SignalCard() {
  const signalData = useDashboardStore((s) => s.signalData);
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const activeInterval = useDashboardStore((s) => s.activeInterval);
  const setChartInterval = useDashboardStore((s) => s.setInterval);

  const [mtfMap, setMtfMap] = useState<Record<string, MtfItem>>({});

  // Çoklu Zaman Dilimi (1m, 5m, 15m, 1h, 4h) Canlı Sinyal Pusulası
  useEffect(() => {
    let cancelled = false;
    setMtfMap({});

    const fetchOneInterval = async (tf: string): Promise<MtfItem | null> => {
      const endpoints = [
        "https://data-api.binance.vision/api/v3/klines",
        "https://api.binance.com/api/v3/klines",
      ];
      for (const base of endpoints) {
        try {
          const res = await fetch(`${base}?symbol=${activeSymbol}&interval=${tf}&limit=80`);
          if (!res.ok) continue;
          const raw = (await res.json()) as unknown[][];
          if (!Array.isArray(raw) || raw.length < 30) continue;
          const candles: CandleData[] = raw.map((k) => ({
            time: Math.floor(Number(k[0]) / 1000),
            open: parseFloat(String(k[1])),
            high: parseFloat(String(k[2])),
            low: parseFloat(String(k[3])),
            close: parseFloat(String(k[4])),
            volume: parseFloat(String(k[5])),
            taker_buy_volume: parseFloat(String(k[9])),
          }));
          const sig = buildSignalPayloadFromCandles(activeSymbol, candles);
          if (!sig) continue;
          const { shortLabel, tone } = classifyScore(sig.score);
          return { interval: tf, score: sig.score, shortLabel, tone };
        } catch {
          // try next endpoint
        }
      }
      return null;
    };

    const loadAll = async () => {
      const results = await Promise.all(MTF_INTERVALS.map((tf) => fetchOneInterval(tf)));
      if (cancelled) return;
      const next: Record<string, MtfItem> = {};
      for (const item of results) {
        if (item) next[item.interval] = item;
      }
      setMtfMap(next);
    };

    loadAll();
    const timer = window.setInterval(loadAll, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeSymbol]);

  const score = signalData?.score ?? 0;
  const label = signalData?.label ?? "BEKLE / NÖTR";
  const price = signalData?.price ?? 0;
  const reasons = signalData?.reasons ?? [];
  const level = getSignalLevel(score);

  // Aktif zaman dilimini canlı sinyal skoruyla anlık senkron tut
  const mergedMtf: MtfItem[] = MTF_INTERVALS.map((tf) => {
    if (tf === activeInterval && signalData) {
      const { shortLabel, tone } = classifyScore(signalData.score);
      return { interval: tf, score: signalData.score, shortLabel, tone };
    }
    return (
      mtfMap[tf] ?? {
        interval: tf,
        score: 50,
        shortLabel: "NÖTR",
        tone: "neu",
      }
    );
  });

  const mtfBuyCount = mergedMtf.filter((m) => m.tone === "pos").length;
  const mtfSellCount = mergedMtf.filter((m) => m.tone === "neg").length;

  const TrendIcon =
    level === "strong_buy" || level === "buy"
      ? TrendingUp
      : level === "sell"
      ? TrendingDown
      : Minus;

  const formatReason = (text: string, isPositive: boolean) => {
    // Remove tick/cross prefix
    let cleanText = text.replace(/^[✓✗]\s*/, "");
    
    let subText = "";
    // Check for subtext delimited by " — "
    const parts = cleanText.split(" — ");
    if (parts.length > 1) {
      cleanText = parts[0];
      subText = parts[1];
    }

    // Format specific keywords as code
    const highlightWords = ["EMA20", "EMA50", "VWAP", "MACD", "RSI"];
    
    return (
      <div className="min-w-0 text-[13.5px] leading-[1.45] break-words">
        {cleanText.split(' ').map((word, i) => {
          // Check if word contains a parenthesis with number e.g. (36.9)
          if (word.match(/\([\d.]+\)/)) {
            return <span key={i}> <code className={`font-mono text-[12.5px] ${isPositive ? "text-[#2fd6a1]" : "text-[#ff3b5c]"}`}>{word.replace(/[()]/g, '')}</code></span>;
          }
          const cleanWord = word.replace(/['.]/g, "");
          if (highlightWords.includes(cleanWord)) {
            return <span key={i}> <code className={`font-mono text-[12.5px] ${isPositive ? "text-[#2fd6a1]" : "text-[#ff3b5c]"}`}>{cleanWord}</code>{word.substring(cleanWord.length)}</span>;
          }
          return " " + word;
        })}
        {subText && <span className="block text-[12px] text-[#a98791] mt-px capitalize">{subText}</span>}
      </div>
    );
  };

  // Determine negative/positive counts
  const positiveCount = reasons.filter(r => r.startsWith("✓")).length;
  const negativeCount = reasons.filter(r => r.startsWith("✗")).length;
  const totalCount = positiveCount + negativeCount || 1;

  // Determine color theme based on score (Pro Dark Terminal)
  const isGood = score >= 60;
  const isNeutral = score >= 40 && score < 60;
  const t = {
    cardBg: isGood
      ? "from-[#0c1a15] to-[#0d0e12]"
      : isNeutral
      ? "from-[#12151f] to-[#0d0e12]"
      : "from-[#1a0d13] to-[#0d0e12]",
    line: isGood
      ? "border-emerald-500/25"
      : isNeutral
      ? "border-[#1e2230]"
      : "border-rose-500/25",
    loss: "text-[#ff5a6e]",
    gain: "text-[#2fd6a1]",
    trackBg: isGood ? "bg-[#152820]" : isNeutral ? "bg-[#1b2030]" : "bg-[#2a151d]",
    shadow: isGood
      ? "shadow-[0_20px_50px_-25px_rgba(47,214,161,0.28)]"
      : isNeutral
      ? "shadow-[0_20px_50px_-25px_rgba(0,0,0,0.5)]"
      : "shadow-[0_20px_50px_-25px_rgba(255,59,92,0.28)]",
    pillBg: isGood
      ? "bg-[#2fd6a1]/10 border-[#2fd6a1]/40 text-[#2fd6a1]"
      : isNeutral
      ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
      : "bg-[#ff5a6e]/10 border-[#ff5a6e]/40 text-[#ff5a6e]",
    mainColor: isGood ? "#2fd6a1" : isNeutral ? "#f5b13d" : "#ff5a6e",
    dirText: isGood ? "Al / Güçlü" : isNeutral ? "Nötr / Dengeli" : "Sat / Zayıf",
  };

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <main className={`@container w-full max-w-[420px] bg-gradient-to-br ${t.cardBg} border ${t.line} rounded-[20px] p-4 flex flex-col gap-4 ${t.shadow} font-sans`}>
      
      {/* Header */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="m-0 text-[13px] tracking-[0.14em] font-bold uppercase text-slate-100">Sinyal Durumu</h1>
          <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-white/10 text-emerald-400 font-bold border border-white/5">
            {activeSymbol.replace("USDT", "")}
          </span>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.1em] uppercase px-3 py-1 rounded-full border ${t.pillBg}`}>
          {label}
        </span>
      </header>

      {/* Hero */}
      <section className="flex items-center gap-4 flex-wrap justify-center @[380px]:justify-start">
        <div className="relative flex-none w-[110px] h-[110px]">
          <svg viewBox="0 0 100 100" aria-hidden="true" className="w-full h-full -rotate-90 overflow-visible">
            <circle cx="50" cy="50" r={radius} fill="none" className={`stroke-current ${t.trackBg.replace('bg-', 'text-')}`} strokeWidth="9" />
            <circle 
              cx="50" cy="50" r={radius} fill="none" 
              stroke={t.mainColor} strokeWidth="9" strokeLinecap="round" 
              strokeDasharray={circumference} strokeDashoffset={circumference - progress}
              style={{ filter: `drop-shadow(0 0 6px ${t.mainColor}80)`, transition: "stroke-dashoffset 1s ease-out" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <b className="font-mono text-[32px] font-semibold leading-none" style={{ color: t.mainColor }}>{score}</b>
            <small className="mt-1 text-[10px] tracking-[0.16em] text-slate-400 uppercase">Puan</small>
          </div>
        </div>
        
        <div className="min-w-0 flex flex-col gap-1.5 text-center @[380px]:text-left">
          <div className="font-mono text-[26px] font-semibold tabular-nums tracking-[-0.01em] text-slate-100">
            ${Math.floor(price)}<i className="not-italic text-slate-400">.{(price % 1).toFixed(2).substring(2)}</i>
          </div>
          <div className="inline-flex items-center justify-center @[380px]:justify-start gap-1.5 text-[13px] font-bold tracking-[0.06em] uppercase" style={{ color: t.mainColor }}>
            <TrendIcon size={16} strokeWidth={2.4} />
            {label}
          </div>
        </div>
      </section>

      {/* Çoklu Zaman Dilimi (MTF) Onay Pusulası */}
      <section className="p-3 rounded-2xl bg-black/30 border border-white/10 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] uppercase text-[#a98791]">
            <Compass size={13} className="text-emerald-400" />
            <span>Çoklu Zaman Pusulası</span>
          </div>
          <span
            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
              mtfBuyCount >= 3
                ? "bg-[#2fd6a1]/15 text-[#2fd6a1] border-[#2fd6a1]/35"
                : mtfSellCount >= 3
                ? "bg-[#ff5a6e]/15 text-[#ff5a6e] border-[#ff5a6e]/35"
                : "bg-amber-500/15 text-amber-300 border-amber-500/30"
            }`}
          >
            {mtfBuyCount >= 3
              ? `${mtfBuyCount}/5 AL ONAYLI`
              : mtfSellCount >= 3
              ? `${mtfSellCount}/5 SAT BASKISI`
              : `${mtfBuyCount} AL • ${mtfSellCount} SAT`}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {mergedMtf.map((item) => {
            const isCurrent = item.interval === activeInterval;
            const badgeStyle =
              item.tone === "pos"
                ? "bg-[#2fd6a1]/15 text-[#2fd6a1] border-[#2fd6a1]/35"
                : item.tone === "neg"
                ? "bg-[#ff5a6e]/15 text-[#ff5a6e] border-[#ff5a6e]/35"
                : "bg-white/5 text-gray-300 border-white/10";
            return (
              <button
                key={item.interval}
                onClick={() => setChartInterval(item.interval)}
                title={`${item.interval} grafiğine geç (Puan: ${item.score})`}
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl border transition-all cursor-pointer ${badgeStyle} ${
                  isCurrent ? "ring-1 ring-white/50 shadow-sm scale-[1.02]" : "opacity-85 hover:opacity-100"
                }`}
              >
                <span className="text-[10px] font-mono font-bold text-white/90">{item.interval}</span>
                <span className="text-[11px] font-mono font-extrabold leading-tight my-0.5">{item.score}</span>
                <span className="text-[8px] font-sans font-bold uppercase tracking-tighter truncate max-w-full">
                  {item.shortLabel === "GÜÇLÜ AL" ? "G.AL" : item.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Balance Indicator */}
      <section className="flex flex-col gap-2">
        <div className="flex justify-between gap-3 text-[11px] tracking-[0.08em] uppercase font-semibold">
          <span className="text-[#ff5a6e]">{negativeCount} olumsuz</span>
          <span className="text-[#2fd6a1]">{positiveCount} olumlu</span>
        </div>
        <div className="grid grid-cols-6 gap-1">
          {Array.from({ length: 6 }).map((_, i) => {
            const isPos = i >= (6 - Math.round((positiveCount / totalCount) * 6));
            return (
              <i key={i} className={`h-1.5 rounded-full ${isPos ? "bg-[#2fd6a1]" : "bg-[#ff5a6e]"}`} />
            );
          })}
        </div>
      </section>

      {/* Why List */}
      <section className={`border-t border-dashed ${t.line} pt-4.5 flex flex-col gap-3`}>
        <h2 className="m-0 flex items-center gap-2 text-[12px] tracking-[0.14em] uppercase text-[#a98791] font-bold">
          <HelpCircle size={16} strokeWidth={2} />
          Neden?
        </h2>
        <ul className="list-none m-0 p-0 flex flex-col gap-2">
          {reasons.length > 0 ? (
            reasons.map((reason, i) => {
              const isPositive = reason.startsWith("✓");
              return (
                <li key={i} className={`flex items-start gap-3 p-2.5 rounded-xl border min-w-0 transition-colors ${
                  isPositive 
                    ? "bg-[#2fd6a1]/5 border-[#2fd6a1]/30 text-[#f6e9ec]" 
                    : "bg-black/25 border-transparent text-[#f6e9ec]"
                }`}>
                  <span className={`flex-none w-5 h-5 rounded-full grid place-items-center mt-px ${
                    isPositive ? "bg-[#2fd6a1]/20 text-[#2fd6a1]" : "bg-[#ff5a6e]/15 text-[#ff5a6e]"
                  }`}>
                    {isPositive ? (
                      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-[11px] h-[11px]"><path d="M2 6.5l2.8 2.8L10 3"/></svg>
                    ) : (
                      <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="w-[11px] h-[11px]"><path d="M2 2l8 8M10 2l-8 8"/></svg>
                    )}
                  </span>
                  {formatReason(reason, isPositive)}
                </li>
              );
            })
          ) : (
            <li className="text-xs text-gray-500">Bağlantı bekleniyor...</li>
          )}
        </ul>
      </section>
    </main>
  );
}
