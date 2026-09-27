"use client";

import { useEffect, useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Flame, BarChart3, Activity } from "lucide-react";
import { useDashboardStore } from "@/lib/store";

export default function GlobalMarketPanel() {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  
  const [fearGreed, setFearGreed] = useState<{ value: number; classification: string }>({
    value: 72,
    classification: "Greed",
  });

  // Mock data for liquidations chart based on selected symbol
  const liqData = useMemo(() => {
    // Deterministic random based on symbol length + char code
    const seedBase = activeSymbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array.from({ length: 24 }).map((_, i) => {
      // Create a pseudo-random value that changes per symbol but stays stable for the same symbol
      const noiseLong = Math.sin(seedBase + i) * 3 + 3; // 0 to 6
      const noiseShort = Math.cos(seedBase + i) * 3 + 3; // 0 to 6
      
      // If BTC or ETH, scale it up
      const multiplier = activeSymbol === "BTCUSDT" || activeSymbol === "ETHUSDT" ? 10 : 1;
      
      return {
        long: (noiseLong * multiplier) + 0.1,
        short: (noiseShort * multiplier) + 0.1,
      };
    });
  }, [activeSymbol]);
  
  const totalLong = liqData.reduce((acc, curr) => acc + curr.long, 0);
  const totalShort = liqData.reduce((acc, curr) => acc + curr.short, 0);
  const totalLiq = totalLong + totalShort;
  const maxBarVal = Math.max(...liqData.map(d => Math.max(d.long, d.short)));

  // Fetch real Fear & Greed index
  useEffect(() => {
    fetch("https://api.alternative.me/fng/?limit=1")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.data && data.data.length > 0) {
          setFearGreed({
            value: Number(data.data[0].value),
            classification: data.data[0].value_classification,
          });
        }
      })
      .catch(() => {}); // Fallback to mock
  }, []);

  // Calculate Fear/Greed gauge rotation (-90deg to 90deg)
  const fgRotation = (fearGreed.value / 100) * 180 - 90;
  let fgColor = "#ef5350"; // Extreme Fear
  if (fearGreed.value >= 25) fgColor = "#ff9800"; // Fear
  if (fearGreed.value >= 45) fgColor = "#fdd835"; // Neutral
  if (fearGreed.value >= 55) fgColor = "#66bb6a"; // Greed
  if (fearGreed.value >= 75) fgColor = "#00e676"; // Extreme Greed

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border-t border-white/5 bg-transparent min-h-[160px] relative z-10 backdrop-blur-xl">
      
      {/* 1. Market Status (Fear & Greed) */}
      <div className="glass-card rounded-2xl p-4 flex flex-col justify-between group relative overflow-hidden transition-all hover:border-white/20">
        <div className="absolute -top-10 -right-10 w-20 h-20 rounded-full blur-[40px] opacity-10 transition-colors duration-1000" style={{ backgroundColor: fgColor }} />
        
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-3 drop-shadow-md">
          <Activity size={14} className="text-white" />
          Piyasa Durumu
        </h3>
        <div className="flex items-center gap-6">
          {/* Gauge Chart */}
          <div className="relative w-24 h-12 overflow-hidden flex flex-col items-center justify-end">
            {/* Background Arc */}
            <div className="absolute top-0 left-0 w-24 h-24 rounded-full border-[8px] border-white/5" />
            {/* Colored Arc (Gradient approximation) */}
            <div 
              className="absolute top-0 left-0 w-24 h-24 rounded-full border-[8px] border-transparent"
              style={{
                borderTopColor: '#ef5350',
                borderRightColor: '#66bb6a',
                transform: 'rotate(45deg)',
                opacity: 0.8
              }}
            />
            {/* Needle */}
            <div 
              className="absolute bottom-0 left-1/2 w-[2px] h-[45px] bg-white origin-bottom transition-transform duration-1000 ease-out z-10"
              style={{ transform: `translateX(-50%) rotate(${fgRotation}deg)` }}
            >
              <div className="absolute -top-1 -left-1 w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_white]" />
            </div>
            
            {/* Center Cover */}
            <div className="absolute bottom-[-10px] left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#06060b] z-20 border border-white/10" />
            
            <div className="absolute bottom-1 text-base font-black tabular-nums z-30 drop-shadow-md" style={{ color: fgColor }}>
              {fearGreed.value}
            </div>
          </div>
          
          <div className="flex-1 space-y-3">
            <div className="flex flex-col">
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Korku & Açgözlülük</span>
              <span className="text-sm font-black drop-shadow-sm" style={{ color: fgColor }}>{fearGreed.classification}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Global Hacim (24s)</span>
              <span className="text-sm font-bold text-white drop-shadow-sm">$64.2B <span className="text-emerald-400 text-[10px] ml-1 bg-emerald-500/10 px-1 py-0.5 rounded shadow-sm">+5.4%</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Trending Coins */}
      <div className="glass-card rounded-2xl p-4 flex flex-col justify-between transition-all hover:border-white/20">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-3 drop-shadow-md">
          <Flame size={14} className="text-orange-400 drop-shadow-[0_0_5px_rgba(251,146,60,0.5)]" />
          Trend Olanlar (24S)
        </h3>
        <div className="space-y-2">
          {['BTC', 'SOL', 'PEPE', 'WIF'].map((coin, idx) => (
            <div key={coin} className="flex items-center justify-between group cursor-pointer hover:bg-white/5 px-2 py-1 -mx-2 rounded-lg transition-colors">
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] text-gray-500 font-black w-3">{idx + 1}</span>
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-[8px] font-bold text-gray-300 group-hover:text-white transition-colors shadow-inner">
                  {coin.slice(0,2)}
                </div>
                <span className="text-xs font-bold text-gray-300 group-hover:text-white transition-colors drop-shadow-sm">{coin}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded shadow-sm">+{1 + (idx * 3)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Derivatives (Liquidations) */}
      <div className="glass-card rounded-2xl p-4 flex flex-col justify-between transition-all hover:border-white/20 relative overflow-hidden group">
        <div className="absolute -top-10 -right-10 w-20 h-20 rounded-full blur-[40px] opacity-0 group-hover:opacity-10 transition-opacity duration-700 pointer-events-none bg-blue-500" />
        
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between mb-3 drop-shadow-md">
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-blue-400" />
            Likitasyonlar ({activeSymbol.replace("USDT", "")})
          </div>
          <span className="text-[10px] font-black tabular-nums bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-gray-300 drop-shadow-sm">${totalLiq.toFixed(1)}M</span>
        </h3>
        
        <div className="flex items-center justify-between text-[10px] font-black mb-3">
          <div className="flex items-center gap-1.5 bg-emerald-500/5 border border-emerald-500/10 px-2 py-1 rounded shadow-sm">
            <span className="text-gray-500 uppercase">Long:</span>
            <span className="text-emerald-400 drop-shadow-sm">${totalLong.toFixed(1)}M</span>
          </div>
          <div className="flex items-center gap-1.5 bg-red-500/5 border border-red-500/10 px-2 py-1 rounded shadow-sm">
            <span className="text-gray-500 uppercase">Short:</span>
            <span className="text-red-400 drop-shadow-sm">${totalShort.toFixed(1)}M</span>
          </div>
        </div>

        {/* Mirrored Bar Chart */}
        <div className="flex items-center gap-[3px] h-14 w-full mt-auto relative">
          <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-white/10 -translate-y-1/2" />
          {liqData.map((data, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-center gap-[1px] h-full z-10 hover:opacity-80 cursor-crosshair transition-opacity">
              {/* Longs (Top) */}
              <div 
                className="w-full bg-gradient-to-t from-emerald-500/80 to-emerald-400 rounded-t-sm shadow-[0_0_5px_rgba(16,185,129,0.3)]" 
                style={{ height: `${(data.long / maxBarVal) * 50}%`, marginBottom: '1px' }}
              />
              {/* Shorts (Bottom) */}
              <div 
                className="w-full bg-gradient-to-b from-red-500/80 to-red-400 rounded-b-sm shadow-[0_0_5px_rgba(239,68,68,0.3)]" 
                style={{ height: `${(data.short / maxBarVal) * 50}%`, marginTop: '1px' }}
              />
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
