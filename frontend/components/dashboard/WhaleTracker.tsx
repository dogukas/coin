"use client";

import { useEffect, useState, useRef } from "react";
import { useDashboardStore } from "@/lib/store";
import { formatNumber, formatVolume } from "@/lib/utils";
import { Anchor } from "lucide-react";
import type { TradeData } from "@/lib/utils";

interface WhaleTrade extends TradeData {
  value: number;
}

export default function WhaleTracker() {
  const trades = useDashboardStore((s) => s.trades);
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  
  const [minWhaleUsd, setMinWhaleUsd] = useState<number>(15000);
  const [whaleTrades, setWhaleTrades] = useState<WhaleTrade[]>([]);
  const [flashingId, setFlashingId] = useState<string | null>(null);
  const prevSymbolRef = useRef(activeSymbol);
  const flashTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (prevSymbolRef.current !== activeSymbol) {
      prevSymbolRef.current = activeSymbol;
      setWhaleTrades([]);
      return;
    }

    if (!trades || trades.length === 0) return;
    
    const latestTrade = trades[0];
    const tradeValue = latestTrade.price * latestTrade.quantity;
    
    // Capture large whale trades above selected threshold
    if (tradeValue >= minWhaleUsd) {
      setWhaleTrades((prev) => {
        const isDuplicate = prev.some(
          t => t.time === latestTrade.time && t.quantity === latestTrade.quantity
        );
        if (isDuplicate) return prev;
        
        const newTrade = { ...latestTrade, value: tradeValue };
        return [newTrade, ...prev].slice(0, 20);
      });
      
      // Flash effect
      const id = `${latestTrade.time}-${latestTrade.quantity}`;
      setFlashingId(id);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashingId(null), 1000);
    }
  }, [trades, activeSymbol, minWhaleUsd]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  // Son 50 işlemdeki toplam balina alım ve satım hacmi
  let totalBuyUsd = 0;
  let totalSellUsd = 0;
  for (const t of trades) {
    const val = t.price * t.quantity;
    if (!t.is_buyer_maker) totalBuyUsd += val;
    else totalSellUsd += val;
  }
  const netFlowUsd = totalBuyUsd - totalSellUsd;
  const buyPct = totalBuyUsd + totalSellUsd > 0 ? (totalBuyUsd / (totalBuyUsd + totalSellUsd)) * 100 : 50;

  const cardClass = "min-w-0 bg-gradient-to-br from-[var(--card-2)] to-[var(--card)] border border-[var(--line)] rounded-[18px] p-4 flex flex-col gap-3 flex-1 min-h-[240px]";
  const chClass = "flex items-center justify-between gap-2 min-h-[22px] flex-wrap";
  const h2Class = "m-0 text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--ink-dim)]";

  return (
    <section className={cardClass} aria-label="Balina Avcısı">
      <div className={chClass}>
        <div className="flex items-center gap-2">
          <Anchor className="w-4 h-4 flex-none text-[#3b82f6]" strokeWidth={1.8} />
          <h2 className={h2Class}>Balina & Nakit Girişi</h2>
        </div>

        <div className="flex items-center gap-1 text-[10px] font-mono">
          {[10000, 15000, 50000].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setMinWhaleUsd(v)}
              className={`px-1.5 py-0.5 rounded border cursor-pointer ${
                minWhaleUsd === v
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold"
                  : "bg-white/5 text-gray-400 border-white/10"
              }`}
            >
              +${v / 1000}K
            </button>
          ))}
        </div>
      </div>

      {/* Canlı Net Para Girişi Barı */}
      <div className="p-2 rounded-xl bg-black/30 border border-white/10 flex flex-col gap-1.5 text-[10px] font-mono">
        <div className="flex items-center justify-between">
          <span className="text-gray-400 font-sans">Canlı Net Para Akışı:</span>
          <strong className={netFlowUsd >= 0 ? "text-emerald-400" : "text-rose-400"}>
            {netFlowUsd >= 0 ? "+" : "-"}${formatVolume(Math.abs(netFlowUsd))} (%{buyPct.toFixed(0)} Alıcı)
          </strong>
        </div>
        <div className="w-full h-1.5 rounded-full bg-rose-500/40 overflow-hidden flex">
          <div className="h-full bg-emerald-400 transition-all duration-300" style={{ width: `${buyPct}%` }} />
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto pr-1 custom-scrollbar flex flex-col gap-1">
          {whaleTrades.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--ink-dim)] italic">
              Büyük emir bekleniyor...
            </div>
          ) : (
            whaleTrades.map((t, i) => {
              const id = `${t.time}-${t.quantity}`;
              const isFlashing = flashingId === id;
              const isBuy = t.is_buyer_maker === false; // If buyer is not maker, it's a taker BUY
              
              return (
                <div 
                  key={i} 
                  className={`grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[11px] font-mono p-2 rounded-lg transition-colors duration-300 ${isFlashing ? (isBuy ? 'bg-[var(--gain)]/20' : 'bg-[var(--loss)]/20') : 'bg-black/10'}`}
                >
                  <span className="text-[var(--ink-faint)]">
                    {new Date(t.time).toLocaleTimeString("tr-TR", { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                  </span>
                  
                  <span className={`font-semibold ${isBuy ? "text-[var(--gain)]" : "text-[var(--loss)]"}`}>
                    {formatNumber(t.price)}
                  </span>
                  
                  <div className="flex flex-col items-end">
                    <span className="font-bold text-[var(--ink)]">${(t.value / 1000).toFixed(1)}k</span>
                    <span className="text-[9px] text-[var(--ink-faint)]">{formatNumber(t.quantity)} {activeSymbol.replace("USDT","")}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
