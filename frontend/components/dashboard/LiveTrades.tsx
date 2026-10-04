"use client";

import { useDashboardStore } from "@/lib/store";
import { formatNumber } from "@/lib/utils";
import { Clock } from "lucide-react";

export default function LiveTrades() {
  const trades = useDashboardStore((s) => s.trades);
  
  // Calculate max quantity to scale the background fill
  const maxQty = trades.length > 0 ? Math.max(...trades.map(t => t.quantity)) : 1;

  const cardClass = "min-w-0 bg-gradient-to-br from-[var(--card-2)] to-[var(--card)] border border-[var(--line)] rounded-[18px] flex flex-col p-0 overflow-hidden";
  const chClass = "flex items-center gap-2 min-h-[22px] px-4 pt-4 pb-2";

  return (
    <section className={cardClass} aria-label="Canlı emir akışı">
      <div className={chClass}>
        <Clock className="w-4 h-4 text-[var(--ink-dim)]" strokeWidth={1.8} />
        <h2 className="m-0 text-[13px] font-bold text-[var(--ink)] tracking-[0.04em]">Canlı Emir Akışı</h2>
        <span className="ml-auto font-mono text-[11px] text-[var(--ink-dim)] bg-white/5 border border-[var(--line)] px-2 py-1 rounded-[7px] whitespace-nowrap font-normal">
          Son 50
        </span>
      </div>
      
      <div className="max-h-[400px] overflow-y-auto overflow-x-auto custom-scrollbar flex-1">
        <table className="w-full border-collapse font-mono text-[12px] tabular-nums">
          <thead className="sticky top-0 z-10 bg-[var(--card)]">
            <tr>
              <th className="text-left font-normal text-[10px] tracking-[0.08em] uppercase text-[var(--ink-faint)] px-4 py-2.5 pb-2">Fiyat (USDT)</th>
              <th className="text-right font-normal text-[10px] tracking-[0.08em] uppercase text-[var(--ink-faint)] px-4 py-2.5 pb-2">Miktar</th>
              <th className="text-right font-normal text-[10px] tracking-[0.08em] uppercase text-[var(--ink-faint)] px-4 py-2.5 pb-2">Zaman</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center text-xs text-[var(--ink-faint)] py-6">
                  Akış bekleniyor...
                </td>
              </tr>
            ) : (
              trades.map((trade, i) => {
                const isSell = trade.is_buyer_maker; // True -> Sell, False -> Buy
                const date = new Date(trade.time);
                const timeStr = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
                const fillPct = Math.min(100, Math.max(6, (trade.quantity / maxQty) * 100));
                
                const tint = isSell ? "rgba(255,90,110,.14)" : "rgba(47,214,161,.14)";
                const textColor = isSell ? "text-[var(--loss)]" : "text-[var(--gain)]";
                
                return (
                  <tr key={`${trade.time}-${i}`} className="hover:bg-white/5 transition-colors">
                    <td className={`text-left font-semibold px-4 py-2.5 border-t border-white/5 ${textColor}`}>
                      {formatNumber(trade.price)}
                    </td>
                    <td 
                      className="text-right px-4 py-2.5 border-t border-white/5" 
                      style={{ background: `linear-gradient(270deg, ${tint} ${fillPct}%, transparent ${fillPct}%)` }}
                    >
                      {formatNumber(trade.quantity)}
                    </td>
                    <td className="text-right px-4 py-2.5 border-t border-white/5 text-[var(--ink-faint)]">
                      {timeStr}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      <div className="flex gap-3.5 px-4 py-2.5 text-[10px] text-[var(--ink-dim)] border-t border-white/5 shrink-0">
        <span className="flex items-center"><i className="inline-block w-2 h-2 rounded-[2px] mr-1.5 bg-[var(--gain)]" />Alış</span>
        <span className="flex items-center"><i className="inline-block w-2 h-2 rounded-[2px] mr-1.5 bg-[var(--loss)]" />Satış</span>
      </div>
    </section>
  );
}
