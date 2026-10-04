"use client";

import { useEffect, useState, useCallback } from "react";
import { Activity, Flame, BarChart3, Loader2 } from "lucide-react";
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
      .catch(() => {});
  }, []);

  const fetchPressure = useCallback(async () => {
    setPressureLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/market/buy-sell-pressure/${activeSymbol}?limit=32`);
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
    const interval = setInterval(fetchPressure, 60000);
    return () => clearInterval(interval);
  }, [fetchPressure]);

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

  const totalBuy = pressureData.reduce((acc, curr) => acc + curr.buy_volume, 0);
  const totalSell = pressureData.reduce((acc, curr) => acc + curr.sell_volume, 0);
  const totalVol = totalBuy + totalSell;
  const maxBarVal = pressureData.length > 0
    ? Math.max(...pressureData.map(d => Math.max(d.buy_volume, d.sell_volume)))
    : 1;
    
  const buyPct = totalVol > 0 ? (totalBuy / totalVol) * 100 : 50;

  const formatVol = (v: number): string => {
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return v.toFixed(0);
  };

  const formatExactMoney = (v: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(v);
  };

  // Fear & Greed SVG rendering
  const fgValue = fearGreed.value;
  const fgCx = 80, fgCy = 80, fgR = 62;
  const fgZones = [[0, 25, 'var(--loss)'], [25, 45, '#ff9a5a'], [45, 55, 'var(--warn)'], [55, 75, '#7fd66a'], [75, 100, 'var(--gain)']];
  const pt = (v: number, rad: number) => { 
    const a = (180 - v * 1.8) * Math.PI / 180; 
    return [
      Number((fgCx + rad * Math.cos(a)).toFixed(3)), 
      Number((fgCy - rad * Math.sin(a)).toFixed(3))
    ]; 
  };
  const fgIndicatorPt = pt(fgValue, fgR);

  // Common card classes
  const cardClass = "min-w-0 bg-gradient-to-br from-[var(--card-2)] to-[var(--card)] border border-[var(--line)] rounded-[18px] p-4 flex flex-col gap-3.5";
  const chClass = "flex items-center gap-2 min-h-[22px]";
  const h2Class = "m-0 text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--ink-dim)]";
  
  const maxCoinChange = trendingCoins.length > 0 ? Math.max(...trendingCoins.map(c => c.change_24h)) : 1;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      
      {/* 1. Piyasa Durumu */}
      <section className={cardClass} aria-label="Piyasa durumu">
        <div className={chClass}>
          <Activity className="w-4 h-4 flex-none text-[var(--ink-dim)]" strokeWidth={1.8} />
          <h2 className={h2Class}>Piyasa Durumu</h2>
        </div>
        
        <div className="relative">
          <svg viewBox="0 0 160 92" className="w-full h-auto block overflow-visible">
            {fgZones.map((z, i) => {
              const a = pt(Number(z[0]) + 0.8, fgR);
              const b = pt(Number(z[1]) - 0.8, fgR);
              const active = fgValue >= Number(z[0]) && fgValue <= Number(z[1]);
              return (
                <path 
                  key={i} 
                  d={`M${a[0]} ${a[1]} A${fgR} ${fgR} 0 0 1 ${b[0]} ${b[1]}`} 
                  fill="none" 
                  stroke={z[2] as string} 
                  strokeWidth="10" 
                  strokeLinecap="round" 
                  opacity={active ? 1 : 0.28} 
                />
              );
            })}
            <circle cx={fgIndicatorPt[0]} cy={fgIndicatorPt[1]} r="8" fill="var(--ink)" stroke="var(--card)" strokeWidth="3" />
            <text x={fgCx} y="76" textAnchor="middle" fontSize="30" fontWeight="600" fill="var(--ink)" fontFamily="var(--font-mono)">
              {fgValue}
            </text>
            <text x={pt(0, fgR)[0] - 5} y="92" textAnchor="middle" fontSize="9" fill="var(--ink-faint)" fontFamily="var(--font-mono)">0</text>
            <text x={pt(100, fgR)[0] + 5} y="92" textAnchor="middle" fontSize="9" fill="var(--ink-faint)" fontFamily="var(--font-mono)">100</text>
          </svg>
          <div className="text-center -mt-0.5">
            <small className="block text-[10px] tracking-[0.14em] uppercase text-[var(--ink-dim)]">Korku &amp; Açgözlülük</small>
            <strong className="text-[20px] font-bold" style={{ color: fgValue >= 55 ? "var(--gain)" : fgValue <= 45 ? "var(--loss)" : "var(--warn)" }}>
              {fearGreed.classification}
            </strong>
          </div>
        </div>
        
        <div className="flex items-center justify-between gap-2.5 flex-wrap border-t border-dashed border-[var(--line)] pt-3 mt-auto">
          <div>
            <small className="block text-[10px] tracking-[0.12em] uppercase text-[var(--ink-dim)] mb-1">Global Hacim (24s)</small>
            <b className="font-mono text-[20px] font-semibold">${formatVol(globalVolume)}</b>
          </div>
          {totalBuy > totalSell ? (
             <span className="inline-flex font-mono font-bold text-[10px] leading-none tracking-[0.08em] uppercase px-2.5 py-1.5 rounded-lg border text-[var(--gain)] bg-[rgba(47,214,161,0.1)] border-[rgba(47,214,161,0.35)] whitespace-nowrap">Alıcı Güçlü</span>
          ) : (
             <span className="inline-flex font-mono font-bold text-[10px] leading-none tracking-[0.08em] uppercase px-2.5 py-1.5 rounded-lg border text-[var(--loss)] bg-[rgba(255,90,110,0.1)] border-[rgba(255,90,110,0.35)] whitespace-nowrap">Satıcı Güçlü</span>
          )}
        </div>
      </section>

      {/* 2. En Çok Yükselenler */}
      <section className={cardClass} aria-label="En çok yükselenler">
        <div className={chClass}>
          <Flame className="w-4 h-4 flex-none text-[var(--warn)]" strokeWidth={1.8} />
          <h2 className={h2Class}>En Çok Yükselenler (24s)</h2>
        </div>
        <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
          {trendingCoins.length > 0 ? trendingCoins.map((coin, i) => {
            const base = coin.symbol.replace("USDT", "");
            return (
              <li key={coin.symbol} className="grid grid-cols-[14px_30px_minmax(0,1fr)_auto] items-center gap-2.5 p-2 px-2.5 rounded-xl bg-black/20">
                <span className="font-mono text-[11px] text-[var(--ink-faint)]">{i + 1}</span>
                <span className="w-[30px] h-[30px] rounded-full grid place-items-center font-bold text-[10px] bg-[#34151f] border border-[var(--line)] text-[var(--ink)]">
                  {base.slice(0, 2)}
                </span>
                <span className="min-w-0 flex flex-col gap-1.5">
                  <b className="text-[13px] tracking-[0.02em] font-semibold truncate">{base}</b>
                  <span className="relative h-1 rounded-full bg-[var(--track)]">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--gain)]" style={{ width: `${(coin.change_24h / maxCoinChange) * 100}%` }} />
                  </span>
                </span>
                <span className="text-[var(--gain)] font-mono font-bold text-[10px] px-1 py-0.5 rounded-md bg-[var(--gain)]/10 border border-[var(--gain)]/30">
                  +{coin.change_24h.toFixed(2)}%
                </span>
              </li>
            );
          }) : (
             <div className="flex flex-col items-center justify-center py-6 text-gray-500 text-xs">
               <Loader2 className="w-5 h-5 animate-spin mb-2" />
               Yükleniyor...
             </div>
          )}
        </ul>
      </section>

      {/* 3. Alıcı / Satıcı (QNT) */}
      <section className={cardClass} aria-label="Alıcı satıcı">
        <div className={chClass}>
          <BarChart3 className="w-4 h-4 flex-none text-[#6aa8ff]" strokeWidth={1.8} />
          <h2 className={h2Class}>Alıcı / Satıcı ({activeSymbol.replace("USDT", "")})</h2>
          <span className="ml-auto font-mono text-[11px] font-semibold text-[var(--ink)] bg-white/5 border border-[var(--line)] px-2 py-1 rounded-[7px] whitespace-nowrap">
            {formatExactMoney(totalVol)}
          </span>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-[10px] p-2 px-2.5 border border-[rgba(47,214,161,0.3)] bg-[rgba(47,214,161,0.07)] text-[var(--gain)] min-w-0">
            <small className="block text-[10px] tracking-[0.1em] uppercase mb-1">Alıcı</small>
            <b className="font-mono text-[13px] font-semibold break-all">{formatExactMoney(totalBuy)}</b>
          </div>
          <div className="rounded-[10px] p-2 px-2.5 border border-[rgba(255,90,110,0.3)] bg-[rgba(255,90,110,0.07)] text-[var(--loss)] min-w-0">
            <small className="block text-[10px] tracking-[0.1em] uppercase mb-1">Satıcı</small>
            <b className="font-mono text-[13px] font-semibold break-all">{formatExactMoney(totalSell)}</b>
          </div>
        </div>
        
        <div className="flex h-2 rounded-full overflow-hidden gap-[2px]">
          <i className="block h-full bg-[var(--gain)]" style={{ width: `${buyPct}%` }} />
          <i className="block h-full bg-[var(--loss)]" style={{ width: `${100 - buyPct}%` }} />
        </div>

        <div className="mt-auto pt-2">
          {pressureData.length > 0 ? (
            <svg viewBox="0 0 320 96" className="w-full h-auto block">
              <line x1="0" x2="320" y1="48" y2="48" stroke="var(--line)" strokeWidth="1" />
              {pressureData.map((d, i) => {
                const w = 320 / pressureData.length;
                const bH = Math.max(2, (d.buy_volume / maxBarVal) * 44);
                const sH = Math.max(2, (d.sell_volume / maxBarVal) * 44);
                return (
                  <g key={i}>
                    <rect x={i * w + 1} y={48 - bH} width={w - 2} height={bH - 1} rx={w > 4 ? 2 : 0} fill="var(--gain)" />
                    <rect x={i * w + 1} y={49} width={w - 2} height={sH} rx={w > 4 ? 2 : 0} fill="var(--loss)" />
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className="h-[96px] w-full flex items-center justify-center text-xs text-gray-500">
               Veri bekleniyor...
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
