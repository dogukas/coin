"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, LayoutGrid, Flame, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { TACubeData, getSignalColor, formatPrice, getSignalLevel } from "@/lib/utils";

export default function ScreenerPage() {
  const [cubes, setCubes] = useState<TACubeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "strong_buy" | "high_pressure" | "oversold">("all");

  const fetchCubes = async () => {
    try {
      setLoading(true);
      const res = await fetch("http://localhost:8000/api/market/ta-cubes?limit=24");
      if (res.ok) {
        const data = await res.json();
        setCubes(data);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCubes();
    const interval = setInterval(fetchCubes, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, []);

  // Apply filters
  const filteredCubes = cubes.filter((c) => {
    // 1. Search filter
    if (searchQuery && !c.symbol.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    
    // 2. Type filter
    if (filterType === "strong_buy" && c.signal_score < 65) return false;
    if (filterType === "high_pressure" && c.buy_pressure_pct < 60) return false;
    if (filterType === "oversold" && (c.rsi_14 === null || c.rsi_14 > 40)) return false;
    
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-900/50">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <LayoutGrid size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Teknik Analiz & Emir Akışı (Küp Görünümü)</h1>
              <p className="text-xs text-gray-400">Piyasadaki en hacimli coinlerin TA ve Alış Baskısı analizleri</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {loading && <Loader2 size={16} className="text-gray-400 animate-spin" />}
          {lastUpdated && (
            <div className="hidden md:block text-xs text-gray-500 font-mono">
              Güncelleme: {lastUpdated.toLocaleTimeString('tr-TR')}
            </div>
          )}
          <button 
            onClick={fetchCubes}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-bold transition-colors"
          >
            Yenile
          </button>
        </div>
      </header>

      {/* Filters Toolbar */}
      <div className="px-6 py-3 border-b border-white/5 bg-slate-900/30 flex flex-col sm:flex-row items-center gap-4 justify-between">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          <FilterButton 
            active={filterType === "all"} 
            onClick={() => setFilterType("all")}
            label="Tümü"
          />
          <FilterButton 
            active={filterType === "strong_buy"} 
            onClick={() => setFilterType("strong_buy")}
            label="Yüksek Sinyal (Skor > 65)"
            color="emerald"
          />
          <FilterButton 
            active={filterType === "high_pressure"} 
            onClick={() => setFilterType("high_pressure")}
            label="Yoğun Alım (>%60)"
            color="orange"
          />
          <FilterButton 
            active={filterType === "oversold"} 
            onClick={() => setFilterType("oversold")}
            label="Aşırı Satım (RSI < 40)"
            color="blue"
          />
        </div>
        
        <div className="w-full sm:w-64">
          <input
            type="text"
            placeholder="Coin Ara (Örn: BTC)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* Grid */}
      <main className="flex-1 p-6 overflow-y-auto custom-scrollbar">
        {cubes.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            Veri bulunamadı. Lütfen API'nin çalıştığından emin olun.
          </div>
        ) : filteredCubes.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-[50vh] text-gray-500">
            <div className="text-4xl mb-3">🔍</div>
            <p>Bu filtrelere uygun coin bulunamadı.</p>
            <button 
              onClick={() => { setFilterType("all"); setSearchQuery(""); }}
              className="mt-4 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors"
            >
              Filtreleri Temizle
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {filteredCubes.map((c) => (
              <CubeCard key={c.symbol} data={c} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function CubeCard({ data }: { data: TACubeData }) {
  const isPositive = data.change_24h >= 0;
  const isStrongBuy = data.buy_pressure_pct > 60;
  const signalColor = getSignalColor(data.signal_score);
  
  // Convert signal_level enum-like string to Turkish
  const getSignalText = (level: string) => {
    switch(level) {
      case "strong_buy": return "GÜÇLÜ AL";
      case "buy": return "AL";
      case "hold": return "BEKLE / NÖTR";
      case "sell": return "SAT";
      default: return level;
    }
  };

  return (
    <div className="bg-slate-900 border border-white/5 rounded-xl p-4 flex flex-col gap-3 hover:border-white/20 transition-colors shadow-lg">
      
      {/* Top row: Symbol and Price */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{data.symbol.replace("USDT", "")}</h2>
          <span className="text-[10px] text-gray-500">/USDT</span>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono font-bold">${formatPrice(data.price)}</div>
          <div className={`text-xs font-semibold flex items-center justify-end gap-0.5 ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
            {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(data.change_24h).toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Buy Pressure Progress */}
      <div className="pt-2 border-t border-white/5">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-gray-400">Emir Baskısı (Alış)</span>
          <span className={`text-xs font-bold ${isStrongBuy ? "text-orange-400" : "text-gray-300"}`}>
            %{data.buy_pressure_pct}
          </span>
        </div>
        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden flex">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${isStrongBuy ? 'bg-orange-500' : 'bg-blue-500'}`}
            style={{ width: `${data.buy_pressure_pct}%` }}
          />
          <div 
            className="h-full bg-rose-500/50 rounded-r-full transition-all duration-500"
            style={{ width: `${100 - data.buy_pressure_pct}%` }}
          />
        </div>
      </div>

      {/* TA Indicators */}
      <div className="grid grid-cols-2 gap-2 mt-1">
        <div className="bg-white/5 rounded-lg p-2 flex flex-col items-center justify-center">
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">RSI (14)</span>
          <span className="text-xs font-mono font-semibold text-white">
            {data.rsi_14 ? data.rsi_14.toFixed(1) : "—"}
          </span>
        </div>
        <div className="bg-white/5 rounded-lg p-2 flex flex-col items-center justify-center">
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">MACD</span>
          <span className={`text-xs font-bold ${data.macd_trend === 'bullish' ? 'text-emerald-400' : data.macd_trend === 'bearish' ? 'text-rose-400' : 'text-gray-400'}`}>
            {data.macd_trend === 'bullish' ? "Yükseliş" : data.macd_trend === 'bearish' ? "Düşüş" : "—"}
          </span>
        </div>
      </div>

      {/* Sparkline Chart */}
      {data.sparkline && data.sparkline.length > 0 && (
        <Sparkline 
          data={data.sparkline} 
          color={isPositive ? "#34d399" : "#fb7185"} 
        />
      )}

      {/* Overall Score Badge */}
      <div 
        className="mt-1 py-2 rounded-lg text-center flex items-center justify-center gap-2"
        style={{ backgroundColor: `${signalColor}15`, border: `1px solid ${signalColor}30` }}
      >
        <Activity size={14} style={{ color: signalColor }} />
        <span className="text-xs font-bold" style={{ color: signalColor }}>
          {getSignalText(data.signal_level)} ({data.signal_score})
        </span>
      </div>

    </div>
  );
}

function FilterButton({ active, onClick, label, color = "blue" }: { active: boolean, onClick: () => void, label: string, color?: "blue" | "emerald" | "orange" }) {
  const colorStyles = {
    blue: active ? "bg-blue-600 text-white border-blue-500" : "bg-slate-800 text-gray-400 border-white/5 hover:border-blue-500/50 hover:text-blue-400",
    emerald: active ? "bg-emerald-600 text-white border-emerald-500" : "bg-slate-800 text-gray-400 border-white/5 hover:border-emerald-500/50 hover:text-emerald-400",
    orange: active ? "bg-orange-600 text-white border-orange-500" : "bg-slate-800 text-gray-400 border-white/5 hover:border-orange-500/50 hover:text-orange-400",
  };

  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${colorStyles[color]}`}
    >
      {label}
    </button>
  );
}

function Sparkline({ data, color }: { data: number[], color: string }) {
  if (!data || data.length < 2) return null;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const width = 100;
  const height = 30;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
  
  return (
    <div className="w-full h-8 mt-2 opacity-80">
      <svg width="100%" height="100%" viewBox="0 0 100 30" preserveAspectRatio="none" className="overflow-visible">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    </div>
  );
}
