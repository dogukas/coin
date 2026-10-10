"use client";

import { useEffect, useState } from "react";
import { Skull } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { useDashboardStore } from "@/lib/store";

interface Liquidation {
  symbol: string;
  side: string;
  price: number;
  qty: number;
  time: number;
  value: number;
}

export default function LiquidationTracker() {
  const activeSymbol = useDashboardStore(s => s.activeSymbol);
  const [liquidations, setLiquidations] = useState<Liquidation[]>([]);
  const [flashingId, setFlashingId] = useState<string | null>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let isMounted = true;

    const connect = () => {
      ws = new WebSocket("wss://fstream.binance.com/ws/!forceOrder@arr");
      
      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(event.data);
          if (data && data.e === "forceOrder") {
            const o = data.o;
            // o.s = Symbol (e.g. BTCUSDT)
            // o.S = Side (SELL means Long got liquidated, BUY means Short got liquidated)
            // o.p = Price
            // o.q = Original Quantity
            // o.T = Time
            
            const liq: Liquidation = {
              symbol: o.s,
              side: o.S, 
              price: parseFloat(o.p),
              qty: parseFloat(o.q),
              time: o.T,
              value: parseFloat(o.p) * parseFloat(o.q)
            };

            setLiquidations(prev => {
              const newArr = [liq, ...prev].slice(0, 20); // Keep last 20
              return newArr;
            });

            // Flash effect for the symbol if it's the active one or a huge one
            const id = `${liq.time}-${liq.symbol}`;
            setFlashingId(id);
            setTimeout(() => setFlashingId(null), 1000);
          }
        } catch (err) {
          console.error("Parse error for liquidation:", err);
        }
      };

      ws.onerror = () => {
        // Silent reconnect
      };

      ws.onclose = () => {
        if (isMounted) setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, []);

  const cardClass = "min-w-0 bg-gradient-to-br from-[var(--card-2)] to-[var(--card)] border border-[var(--line)] rounded-[18px] p-4 flex flex-col gap-3 flex-1 min-h-[220px]";
  const chClass = "flex items-center gap-2 min-h-[22px]";
  const h2Class = "m-0 text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--ink-dim)]";

  return (
    <section className={cardClass} aria-label="Tasfiye Haritası">
      <div className={chClass}>
        <Skull className="w-4 h-4 flex-none text-[#ff5a6e]" strokeWidth={1.8} />
        <h2 className={h2Class}>Patlayan Pozisyonlar (Global)</h2>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto pr-1 custom-scrollbar flex flex-col gap-1">
          {liquidations.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--ink-dim)] italic">
              Tasfiye (Liquidation) verisi bekleniyor...
            </div>
          ) : (
            liquidations.map((liq, i) => {
              const id = `${liq.time}-${liq.symbol}`;
              const isFlashing = flashingId === id;
              
              // If Side is SELL, it means a LONG position got liquidated (so we show red)
              // If Side is BUY, it means a SHORT position got liquidated (so we show green)
              const isLongLiq = liq.side === "SELL"; 
              
              return (
                <div 
                  key={i} 
                  className={`grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[11px] font-mono p-2 rounded-lg transition-colors duration-300 ${isFlashing ? (isLongLiq ? 'bg-[var(--loss)]/30' : 'bg-[var(--gain)]/30') : 'bg-black/10'} ${liq.symbol === activeSymbol ? 'border border-white/10' : ''}`}
                >
                  <span className={`font-bold text-[10px] ${isLongLiq ? "text-[var(--loss)]" : "text-[var(--gain)]"}`}>
                    {isLongLiq ? "LONG" : "SHRT"}
                  </span>
                  
                  <div className="flex flex-col">
                    <b className="text-[var(--ink)] truncate max-w-[80px]">{liq.symbol}</b>
                    <span className="text-[9px] text-[var(--ink-faint)]">
                       {new Date(liq.time).toLocaleTimeString("tr-TR", { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                    </span>
                  </div>
                  
                  <div className="flex flex-col items-end">
                    <span className="font-bold text-[var(--ink)]">${(liq.value / 1000).toFixed(1)}k</span>
                    <span className="text-[9px] text-[var(--ink-faint)]">{formatNumber(liq.price)}</span>
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
