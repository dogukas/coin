"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Flame, Zap } from "lucide-react";
import { API_URL, formatPrice } from "@/lib/utils";
import { useDashboardStore } from "@/lib/store";

interface PumpAlert {
  symbol: string;
  price: number;
  change_5m: number;
  change_15m: number;
  change_24h: number;
  volume_usd: number;
  vol_spike: number;
  type: "pump" | "dump";
  intensity: "moderate" | "high" | "extreme";
}

export default function PumpAlerts() {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const setSymbol = useDashboardStore((s) => s.setSymbol);
  
  // Keep track of recently alerted symbols to avoid spamming the same alert
  const alertedSymbols = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await fetch(`${API_URL}/api/market/pump-alerts?min_change=1.5&limit=50`);
        if (res.ok) {
          const alerts: PumpAlert[] = await res.json();
          const now = Date.now();

          alerts.forEach((alert) => {
            const lastAlertTime = alertedSymbols.current.get(alert.symbol);
            
            // Only alert if we haven't alerted for this symbol in the last 15 minutes (900000 ms)
            if (!lastAlertTime || now - lastAlertTime > 15 * 60 * 1000) {
              
              // Record alert time
              alertedSymbols.current.set(alert.symbol, now);

              const isPump = alert.type === "pump";
              const isExtreme = alert.intensity === "extreme";
              
              const title = isPump 
                ? (isExtreme ? "🚀 DEV YÜKSELİŞ" : "📈 Yükseliş Başladı")
                : (isExtreme ? "🩸 DEV ÇÖKÜŞ" : "📉 Düşüş Başladı");
              
              const baseName = alert.symbol.replace("USDT", "");
              
              // We render a custom toast element
              toast.custom((t) => (
                <div 
                  className={`
                    w-[320px] p-4 rounded-xl border backdrop-blur-xl shadow-2xl cursor-pointer transition-all hover:scale-[1.02]
                    ${isPump 
                      ? "bg-emerald-950/80 border-emerald-500/50 shadow-emerald-900/20" 
                      : "bg-rose-950/80 border-rose-500/50 shadow-rose-900/20"
                    }
                  `}
                  onClick={() => {
                    toast.dismiss(t);
                    setSymbol(alert.symbol); // Switch to this coin when clicked
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${isPump ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                        {isExtreme ? <Flame size={16} className="animate-pulse" /> : isPump ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      </div>
                      <div>
                        <span className="font-bold text-white text-base">{baseName}</span>
                        <span className="text-[10px] text-gray-400 ml-1">/USDT</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-black ${isPump ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPump ? "+" : ""}{alert.change_5m.toFixed(2)}%
                      </div>
                      <div className="text-[9px] text-gray-400">Son 5 dk</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs mt-3 bg-black/20 p-2 rounded-lg border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-500 uppercase">Fiyat</span>
                      <span className="font-mono text-gray-200">${formatPrice(alert.price)}</span>
                    </div>
                    {alert.vol_spike > 1.5 && (
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] text-gray-500 uppercase flex items-center gap-1">
                          <Zap size={8} className="text-yellow-400" />
                          Hacim
                        </span>
                        <span className="font-bold text-yellow-400">{alert.vol_spike.toFixed(1)}x Artış</span>
                      </div>
                    )}
                  </div>
                </div>
              ), {
                duration: isExtreme ? 8000 : 5000,
              });
            }
          });
        }
      } catch (e) {
        console.error("Pump alert fetch error", e);
      }
    };

    // Check immediately, then every 30 seconds
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    
    return () => clearInterval(interval);
  }, [setSymbol]);

  // This component doesn't render any normal DOM, it just orchestrates toasts
  return null;
}
