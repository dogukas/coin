"use client";

import { useEffect, useState, useCallback } from "react";
import { TrendingUp, TrendingDown, Flame, BarChart3, Activity, Loader2 } from "lucide-react";
import { useDashboardStore } from "@/lib/store";
import { API_URL } from "@/lib/utils";

interface PressureBar {
  time: number;
  buy_volume: number;
  sell_volume: number;
  buy_pct: number;
}

interface TrendingCoin {
  symbol: string;
  change_24h: number;
  volume_usd: number;
}

export default function GlobalMarketPanel() {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  
  const [fearGreed, setFearGreed] = useState<{ value: number; classification: string }>({
    value: 50,
    classification: "Nötr",
  });
  const [globalVolume, setGlobalVolume] = useState<number>(0);

  const [pressureData, setPressureData] = useState<PressureBar[]>([]);
  const [pressureLoading, setPressureLoading] = useState(false);
  const [trendingCoins, setTrendingCoins] = useState<TrendingCoin[]>([]);

  // Fetch Fear & Greed + Global Volume from our backend proxy (no CORS issues)
  useEffect(() => {
    fetch(`${API_URL}/api/market/fear-greed`)
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setFearGreed({
            value: data.value || 50,
            classification: data.classification || "Nötr",
          });
          if (data.global_volume_24h) {
            setGlobalVolume(data.global_volume_24h);
          }
        }
      })
      .catch(() => {}); // Fallback to defaults
  }, []);

  // Fetch real taker buy/sell pressure from backend
  const fetchPressure = useCallback(async () => {
    setPressureLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/market/buy-sell-pressure/${activeSymbol}?limit=24`);
      if (res.ok) {
        const data: PressureBar[] = await res.json();
        setPressureData(data);
      }
    } catch {
      // ignore
    } finally {
      setPressureLoading(false);
    }
  }, [activeSymbol]);

  useEffect(() => {
    fetchPressure();
    const interval = setInterval(fetchPressure, 60000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [fetchPressure]);

  // Fetch trending coins (top gainers)
  useEffect(() => {
    const fetchTrending = () => {
      fetch(`${API_URL}/api/market/overview?limit=5`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.gainers) {
            setTrendingCoins(data.gainers.slice(0, 4));
          }
        })
        .catch(() => {});
    };
    
    fetchTrending();
    const interval = setInterval(fetchTrending, 60000);
    return () => clearInterval(interval);
  }, []);

  // Calculate totals from real data
  const totalBuy = pressureData.reduce((acc, curr) => acc + curr.buy_volume, 0);
  const totalSell = pressureData.reduce((acc, curr) => acc + curr.sell_volume, 0);
  const totalVol = totalBuy + totalSell;
  const maxBarVal = pressureData.length > 0
    ? Math.max(...pressureData.map(d => Math.max(d.buy_volume, d.sell_volume)))
    : 1;

  // Format volume for display (abbreviated)
  const formatVol = (v: number): string => {
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return v.toFixed(0);
  };

  // Format exact money amounts with commas
  const formatExactMoney = (v: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(v);
  };


  // Calculate Fear/Greed gauge rotation (-90deg to 90deg)
  const fgRotation = (fearGreed.value / 100) * 180 - 90;
  let fgColor = "#ef5350"; // Aşırı Korku
  if (fearGreed.value >= 25) fgColor = "#ff9800"; // Korku
  if (fearGreed.value >= 45) fgColor = "#fdd835"; // Nötr
  if (fearGreed.value >= 55) fgColor = "#66bb6a"; // Açgözlülük
  if (fearGreed.value >= 75) fgColor = "#00e676"; // Aşırı Açgözlülük

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
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Korku &amp; Açgözlülük</span>
              <span className="text-sm font-black drop-shadow-sm" style={{ color: fgColor }}>{fearGreed.classification}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Global Hacim (24s)</span>
              <span className="text-sm font-bold text-white drop-shadow-sm">
                {globalVolume > 0 
                  ? `$${formatVol(globalVolume)}`
                  : "—"
                }
                {pressureData.length > 0 && (
                  totalBuy > totalSell ? (
                    <span className="text-emerald-400 text-[10px] ml-1 bg-emerald-500/10 px-1 py-0.5 rounded shadow-sm">ALICI GÜÇLÜ</span>
                  ) : (
                    <span className="text-red-400 text-[10px] ml-1 bg-red-500/10 px-1 py-0.5 rounded shadow-sm">SATICI GÜÇLÜ</span>
                  )
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Trending Coins (Real Data) */}
      <div className="glass-card rounded-2xl p-4 flex flex-col justify-between transition-all hover:border-white/20">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-3 drop-shadow-md">
          <Flame size={14} className="text-orange-400 drop-shadow-[0_0_5px_rgba(251,146,60,0.5)]" />
          En Çok Yükselenler (24S)
        </h3>
        <div className="space-y-2">
          {trendingCoins.length > 0 ? trendingCoins.map((coin, idx) => {
            const baseName = coin.symbol.replace("USDT", "");
            const isPositive = coin.change_24h >= 0;
            return (
              <div key={coin.symbol} className="flex items-center justify-between group cursor-pointer hover:bg-white/5 px-2 py-1 -mx-2 rounded-lg transition-colors">
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] text-gray-500 font-black w-3">{idx + 1}</span>
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-[8px] font-bold text-gray-300 group-hover:text-white transition-colors shadow-inner">
                    {baseName.slice(0,2)}
                  </div>
                  <span className="text-xs font-bold text-gray-300 group-hover:text-white transition-colors drop-shadow-sm">{baseName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm ${
                    isPositive 
                      ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" 
                      : "text-red-400 bg-red-500/10 border border-red-500/20"
                  }`}>
                    {isPositive ? "+" : ""}{coin.change_24h.toFixed(2)}%
                  </span>
                </div>
              </div>
            );
          }) : (
            <div className="text-center text-xs text-gray-600 py-4">
              <Loader2 size={14} className="animate-spin mx-auto mb-1" />
              Yükleniyor...
            </div>
          )}
        </div>
      </div>

      {/* 3. Real Taker Buy vs Sell Volume (24h) */}
      <div className="glass-card rounded-2xl p-4 flex flex-col justify-between transition-all hover:border-white/20 relative overflow-hidden group">
        <div className="absolute -top-10 -right-10 w-20 h-20 rounded-full blur-[40px] opacity-0 group-hover:opacity-10 transition-opacity duration-700 pointer-events-none bg-blue-500" />
        
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between mb-3 drop-shadow-md">
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-blue-400" />
            Alıcı / Satıcı ({activeSymbol.replace("USDT", "")})
          </div>
          <span className="text-[10px] font-black tabular-nums bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-gray-300 drop-shadow-sm">
            {formatExactMoney(totalVol)}
          </span>
        </h3>
        
        <div className="flex items-center justify-between text-[10px] font-black mb-3">
          <div className="flex items-center gap-1.5 bg-emerald-500/5 border border-emerald-500/10 px-2 py-1 rounded shadow-sm">
            <span className="text-gray-500 uppercase">Alıcı:</span>
            <span className="text-emerald-400 drop-shadow-sm">{formatExactMoney(totalBuy)}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-red-500/5 border border-red-500/10 px-2 py-1 rounded shadow-sm">
            <span className="text-gray-500 uppercase">Satıcı:</span>
            <span className="text-red-400 drop-shadow-sm">{formatExactMoney(totalSell)}</span>
          </div>
        </div>

        {/* Mirrored Bar Chart */}
        {pressureLoading ? (
          <div className="flex items-center justify-center h-14">
            <Loader2 size={16} className="text-gray-600 animate-spin" />
          </div>
        ) : pressureData.length > 0 ? (
          <div className="flex items-center gap-[3px] h-14 w-full mt-auto relative">
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-white/10 -translate-y-1/2" />
            {pressureData.map((data, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-center gap-[1px] h-full z-10 hover:opacity-80 cursor-crosshair transition-opacity"
                title={`Alıcı: ${formatExactMoney(data.buy_volume)} | Satıcı: ${formatExactMoney(data.sell_volume)} | %${data.buy_pct.toFixed(1)} Alım`}
              >
                {/* Buy Volume (Top - Green) */}
                <div 
                  className="w-full bg-gradient-to-t from-emerald-500/80 to-emerald-400 rounded-t-sm shadow-[0_0_5px_rgba(16,185,129,0.3)]" 
                  style={{ height: `${(data.buy_volume / maxBarVal) * 50}%`, marginBottom: '1px' }}
                />
                {/* Sell Volume (Bottom - Red) */}
                <div 
                  className="w-full bg-gradient-to-b from-red-500/80 to-red-400 rounded-b-sm shadow-[0_0_5px_rgba(239,68,68,0.3)]" 
                  style={{ height: `${(data.sell_volume / maxBarVal) * 50}%`, marginTop: '1px' }}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-[10px] text-gray-600 py-4">Veri bekleniyor...</div>
        )}
      </div>

    </div>
  );
}
