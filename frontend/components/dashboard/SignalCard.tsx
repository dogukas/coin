"use client";

import { useDashboardStore } from "@/lib/store";
import { getSignalLevel } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react";

export default function SignalCard() {
  const signalData = useDashboardStore((s) => s.signalData);

  const score = signalData?.score ?? 0;
  const label = signalData?.label ?? "BEKLE / NÖTR";
  const price = signalData?.price ?? 0;
  const reasons = signalData?.reasons ?? [];
  const level = getSignalLevel(score);

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

  // Determine color theme based on score (similar to HTML)
  const isGood = score >= 60;
  const t = {
    cardBg: isGood ? "from-[#0d2617] to-[#0a1c12]" : "from-[#260d15] to-[#1c0a10]",
    line: isGood ? "border-[#20432b]" : "border-[#43202b]",
    loss: isGood ? "text-[#ff5a6e]" : "text-[#ff3b5c]",
    gain: "text-[#2fd6a1]",
    trackBg: isGood ? "bg-[#1a2f22]" : "bg-[#3a1a24]",
    shadow: isGood ? "shadow-[0_30px_60px_-30px_rgba(47,214,161,0.35)]" : "shadow-[0_30px_60px_-30px_rgba(255,59,92,0.35)]",
    pillBg: isGood ? "bg-[#2fd6a1]/10 border-[#2fd6a1]/40 text-[#2fd6a1]" : "bg-[#ff5a6e]/10 border-[#ff5a6e]/40 text-[#ff5a6e]",
    mainColor: isGood ? "#2fd6a1" : "#ff5a6e",
    dirText: isGood ? "Al / Güçlü" : "Sat / Zayıf",
  };

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  return (
    <main className={`@container w-full max-w-[420px] bg-gradient-to-br ${t.cardBg} border ${t.line} rounded-[22px] p-5 flex flex-col gap-5 ${t.shadow} font-sans`}>
      
      {/* Header */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="m-0 text-[14px] tracking-[0.14em] font-bold uppercase text-[#f6e9ec]">Sinyal Durumu</h1>
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.1em] uppercase px-3 py-1.5 rounded-full border ${t.pillBg}`}>
          {label}
        </span>
      </header>

      {/* Hero */}
      <section className="flex items-center gap-5 flex-wrap justify-center @[380px]:justify-start">
        <div className="relative flex-none w-[124px] h-[124px]">
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
            <b className="font-mono text-[34px] font-semibold leading-none" style={{ color: t.mainColor }}>{score}</b>
            <small className="mt-1 text-[10px] tracking-[0.16em] text-[#a98791] uppercase">Puan</small>
          </div>
        </div>
        
        <div className="min-w-0 flex flex-col gap-1.5 text-center @[380px]:text-left">
          <div className="font-mono text-[28px] font-semibold tabular-nums tracking-[-0.01em] text-[#f6e9ec]">
            ${Math.floor(price)}<i className="not-italic text-[#a98791]">.{(price % 1).toFixed(2).substring(2)}</i>
          </div>
          <div className="inline-flex items-center justify-center @[380px]:justify-start gap-1.5 text-[13px] font-bold tracking-[0.06em] uppercase" style={{ color: t.mainColor }}>
            <TrendIcon size={16} strokeWidth={2.4} />
            {label}
          </div>
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
