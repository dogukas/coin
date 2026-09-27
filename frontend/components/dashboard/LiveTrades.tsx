"use client";

import { useDashboardStore } from "@/lib/store";
import { formatNumber } from "@/lib/utils";
import { Clock } from "lucide-react";

export default function LiveTrades() {
  const trades = useDashboardStore((s) => s.trades);

  return (
    <div className="bg-slate-900 border border-white/5 rounded-xl flex flex-col h-[300px] overflow-hidden shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-white/5 flex items-center justify-between shrink-0">
        <h3 className="text-xs font-semibold text-gray-300 flex items-center gap-2">
          <Clock size={14} className="text-gray-400" />
          CANLI EMİR AKIŞI
        </h3>
        <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded">
          Son 50
        </span>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-white/5 bg-black/20 shrink-0">
        <span className="text-[10px] font-medium text-gray-500 text-left">Fiyat (USDT)</span>
        <span className="text-[10px] font-medium text-gray-500 text-right">Miktar</span>
        <span className="text-[10px] font-medium text-gray-500 text-right">Zaman</span>
      </div>

      {/* Trade List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
        {trades.length === 0 ? (
          <div className="text-center text-xs text-gray-500 mt-6">
            Akış bekleniyor...
          </div>
        ) : (
          trades.map((trade, i) => {
            const isSell = trade.is_buyer_maker; // True -> Sell (red), False -> Buy (green)
            const color = isSell ? "text-[#ef5350]" : "text-[#00e676]";
            const bgColor = isSell ? "bg-[#ef5350]/5" : "bg-[#00e676]/5";
            const date = new Date(trade.time);
            const timeStr = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;

            return (
              <div
                key={`${trade.time}-${i}`}
                className={`grid grid-cols-3 gap-2 px-2 py-1.5 items-center rounded mb-0.5 ${bgColor} hover:bg-white/[0.03] transition-colors cursor-default`}
              >
                <span className={`text-[11px] font-bold tracking-tight text-left ${color}`}>
                  {formatNumber(trade.price)}
                </span>
                <span className="text-[11px] font-mono text-gray-300 text-right">
                  {formatNumber(trade.quantity)}
                </span>
                <span className="text-[10px] text-gray-500 text-right">
                  {timeStr}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
