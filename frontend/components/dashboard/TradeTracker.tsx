"use client";

import { useState, useEffect } from "react";
import { useDashboardStore } from "@/lib/store";
import { Target, TrendingUp, TrendingDown } from "lucide-react";
import { formatNumber } from "@/lib/utils";

export default function TradeTracker() {
  const signalData = useDashboardStore((s) => s.signalData);
  const currentPrice = signalData?.price ?? 0;
  
  const [entryPrice, setEntryPrice] = useState<string>("");
  const [targetPrice, setTargetPrice] = useState<string>("");
  
  // Set initial entry price to current price if empty
  useEffect(() => {
    if (currentPrice > 0 && entryPrice === "") {
      setEntryPrice(currentPrice.toString());
    }
  }, [currentPrice, entryPrice]);

  const entry = parseFloat(entryPrice) || 0;
  const target = parseFloat(targetPrice) || 0;
  
  const isLong = target > entry;
  
  // Calculations
  let pnlPercent = 0;
  let progress = 0;
  
  if (entry > 0 && currentPrice > 0) {
    pnlPercent = ((currentPrice - entry) / entry) * 100;
  }
  
  if (entry > 0 && target > 0 && entry !== target) {
    // If it's a long trade (buy low, sell high)
    if (isLong) {
      progress = ((currentPrice - entry) / (target - entry)) * 100;
    } else {
      // Short trade (sell high, buy low)
      progress = ((entry - currentPrice) / (entry - target)) * 100;
      // In short, lower price is profit
      pnlPercent = ((entry - currentPrice) / entry) * 100; 
    }
  }

  // Cap progress between 0 and 100 for the bar
  const boundedProgress = Math.max(0, Math.min(100, progress));
  const isProfit = pnlPercent >= 0;

  const cardClass = "min-w-0 bg-gradient-to-br from-[var(--card-2)] to-[var(--card)] border border-[var(--line)] rounded-[18px] p-4 flex flex-col gap-3.5";
  const chClass = "flex items-center gap-2 min-h-[22px]";
  const h2Class = "m-0 text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--ink-dim)]";

  return (
    <section className={cardClass} aria-label="İşlem takipçisi">
      <div className={chClass}>
        <Target className="w-4 h-4 flex-none text-[#a78bfa]" strokeWidth={1.8} />
        <h2 className={h2Class}>Hedef Takibi</h2>
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          {/* Entry Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">Giriş Fiyatı</label>
            <input
              type="number"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              className="bg-black/20 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs font-mono text-[var(--ink)] outline-none focus:border-[var(--line)] transition-colors"
              placeholder="0.00"
            />
          </div>
          {/* Target Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">Hedef Fiyat</label>
            <input
              type="number"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              className="bg-black/20 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs font-mono text-[var(--ink)] outline-none focus:border-[var(--line)] transition-colors"
              placeholder="Hedef girin"
            />
          </div>
        </div>

        {/* Progress Bar & Stats */}
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex justify-between items-end mb-1">
            <div className="flex flex-col">
              <span className="text-[10px] text-[var(--ink-dim)] mb-0.5">Anlık PnL</span>
              <span className={`font-mono text-sm font-bold flex items-center gap-1 ${isProfit ? "text-[var(--gain)]" : "text-[var(--loss)]"}`}>
                {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {isProfit ? "+" : ""}{pnlPercent.toFixed(2)}%
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-[var(--ink-dim)] mb-0.5">Hedefe Kalan</span>
              <span className="font-mono text-[13px] font-semibold text-[var(--ink)]">
                {target > 0 ? (isLong ? formatNumber(Math.max(0, target - currentPrice)) : formatNumber(Math.max(0, currentPrice - target))) : "—"}
              </span>
            </div>
          </div>

          <div className="relative h-2.5 bg-[var(--track)] rounded-full overflow-hidden border border-white/5">
            {target > 0 && entry > 0 && (
              <div 
                className={`absolute inset-y-0 left-0 transition-all duration-500 rounded-full ${isProfit ? "bg-[var(--gain)]" : "bg-[var(--warn)]"}`}
                style={{ width: `${boundedProgress}%` }}
              />
            )}
          </div>
          <div className="flex justify-between text-[9px] text-[var(--ink-faint)] font-mono px-0.5">
            <span>0%</span>
            <span>{boundedProgress.toFixed(1)}%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
    </section>
  );
}
