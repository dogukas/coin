"use client";

import { useEffect, useState } from "react";
import { useDashboardStore } from "@/lib/store";
import { formatNumber } from "@/lib/utils";
import { Anchor } from "lucide-react";
import type { TradeData } from "@/lib/utils";

interface WhaleTrade extends TradeData {
  value: number;
}

const WHALE_THRESHOLD_USD = 50000; // $50k+ is a whale

export default function WhaleTracker() {
  const trades = useDashboardStore((s) => s.trades);
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  
  const [whaleTrades, setWhaleTrades] = useState<WhaleTrade[]>([]);
  const [flashingId, setFlashingId] = useState<string | null>(null);

  useEffect(() => {
    if (!trades || trades.length === 0) return;
    
    const latestTrade = trades[0];
    const tradeValue = latestTrade.price * latestTrade.qty;
    
    // Only capture very large trades (Whales)
    if (tradeValue >= WHALE_THRESHOLD_USD) {
      setWhaleTrades((prev) => {
        // Avoid duplicates (checking by timestamp/price/qty)
        const isDuplicate = prev.some(
          t => t.time === latestTrade.time && t.qty === latestTrade.qty
        );
        if (isDuplicate) return prev;
        
        const newTrade = { ...latestTrade, value: tradeValue };
        const newArr = [newTrade, ...prev].slice(0, 15); // Keep last 15 whale trades
        return newArr;
      });
      
      // Flash effect
      const id = `${latestTrade.time}-${latestTrade.qty}`;
      setFlashingId(id);
      setTimeout(() => setFlashingId(null), 1000);
    }
  }, [trades]);

  // Clear whales when symbol changes
  useEffect(() => {
    setWhaleTrades([]);
  }, [activeSymbol]);

  const cardClass = "min-w-0 bg-gradient-to-br from-[var(--card-2)] to-[var(--card)] border border-[var(--line)] rounded-[18px] p-4 flex flex-col gap-3 flex-1 min-h-[220px]";
  const chClass = "flex items-center gap-2 min-h-[22px]";
  const h2Class = "m-0 text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--ink-dim)]";

  return (
    <section className={cardClass} aria-label="Balina Avcısı">
      <div className={chClass}>
        <Anchor className="w-4 h-4 flex-none text-[#3b82f6]" strokeWidth={1.8} />
        <h2 className={h2Class}>Balina Avcısı (+50K$)</h2>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto pr-1 custom-scrollbar flex flex-col gap-1">
          {whaleTrades.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--ink-dim)] italic">
              Büyük emir bekleniyor...
            </div>
          ) : (
            whaleTrades.map((t, i) => {
              const id = `${t.time}-${t.qty}`;
              const isFlashing = flashingId === id;
              const isBuy = t.isBuyerMaker === false; // If buyer is not maker, it's a taker BUY
              
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
                    <span className="text-[9px] text-[var(--ink-faint)]">{formatNumber(t.qty)} {activeSymbol.replace("USDT","")}</span>
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
