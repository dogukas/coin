"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Map, Loader2, RefreshCw } from "lucide-react";
import { SymbolInfo } from "@/lib/utils";

interface HeatmapCoin extends SymbolInfo {
  volume_usd: number;
}

export default function HeatmapPage() {
  const [coins, setCoins] = useState<HeatmapCoin[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHeatmap = async () => {
    try {
      setLoading(true);
      const res = await fetch("http://localhost:8000/api/market/overview?limit=100");
      if (res.ok) {
        const data = await res.json();
        // Combine popular, gainers, losers into one unique list
        const allCoins = [...data.popular, ...data.gainers, ...data.losers];
        const unique = Array.from(new Map(allCoins.map(item => [item.symbol, item])).values());
        
        // Sort by volume descending
        unique.sort((a, b) => b.volume_usd - a.volume_usd);
        
        // Take top 60 for the heatmap
        setCoins(unique.slice(0, 60));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeatmap();
    const interval = setInterval(fetchHeatmap, 60000); // 1 min refresh
    return () => clearInterval(interval);
  }, []);

  // Helper to determine background color based on 24h change
  const getBackgroundColor = (change: number) => {
    if (change >= 10) return "bg-emerald-500";
    if (change >= 5) return "bg-emerald-600";
    if (change > 0) return "bg-emerald-800";
    if (change === 0) return "bg-slate-700";
    if (change <= -10) return "bg-rose-600";
    if (change <= -5) return "bg-rose-700";
    return "bg-rose-900";
  };

  // Helper to determine flex-grow (size) based on volume
  // Max volume in the array gets a higher flex-grow value
  const getFlexGrow = (volume: number, maxVolume: number) => {
    if (maxVolume === 0) return 1;
    const ratio = volume / maxVolume;
    // Base flex-grow is 1, max is 10.
    return Math.max(1, Math.ceil(ratio * 10));
  };

  const maxVol = coins.length > 0 ? coins[0].volume_usd : 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#020205] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-900/50">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Map size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Piyasa Isı Haritası</h1>
              <p className="text-xs text-gray-400">Kutu boyutu hacmi, renk fiyat değişimini gösterir</p>
            </div>
          </div>
        </div>
        
        <button 
          onClick={fetchHeatmap}
          disabled={loading}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      {/* Heatmap Container */}
      <main className="flex-1 p-2 md:p-4 overflow-y-auto custom-scrollbar">
        {coins.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            Veri bulunamadı. Lütfen API'nin çalıştığından emin olun.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1 w-full h-full content-start">
            {coins.map((c) => (
              <div 
                key={c.symbol}
                className={`flex flex-col items-center justify-center p-2 rounded-sm border border-black/20 hover:brightness-125 transition-all cursor-pointer ${getBackgroundColor(c.change_24h || 0)}`}
                style={{
                  flexGrow: getFlexGrow(c.volume_usd, maxVol),
                  minWidth: "120px",
                  height: `${Math.max(80, getFlexGrow(c.volume_usd, maxVol) * 20)}px`,
                  flexBasis: `${Math.max(10, (c.volume_usd / maxVol) * 30)}%`
                }}
                title={`${c.symbol} - Hacim: $${(c.volume_usd / 1000000).toFixed(1)}M`}
              >
                <span className="font-bold text-lg md:text-xl drop-shadow-md">{c.symbol.replace("USDT", "")}</span>
                <span className="text-sm font-semibold opacity-90 drop-shadow-md">
                  {c.change_24h !== null ? `${c.change_24h > 0 ? "+" : ""}${c.change_24h.toFixed(2)}%` : "—"}
                </span>
                <span className="text-[10px] opacity-70 mt-1">
                  Vol: ${(c.volume_usd / 1000000).toFixed(1)}M
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
