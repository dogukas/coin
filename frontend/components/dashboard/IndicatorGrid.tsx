"use client";

import { useMemo } from "react";
import { useDashboardStore } from "@/lib/store";
import { formatPrice } from "@/lib/utils";
import { calculateEMA, calculateMACD } from "@/lib/indicators";
import {
  Activity,
  BarChart3,
  TrendingUp,
  Waves,
  Maximize2,
  Gauge,
  Layers,
} from "lucide-react";

export default function IndicatorGrid() {
  const signalData = useDashboardStore((s) => s.signalData);
  const candles = useDashboardStore((s) => s.candles);
  const ind = signalData?.indicators;
  const currentPrice = signalData?.price ?? null;

  // Real MACD histogram bars (last 20 candles), EMA20/EMA50 SVG points, and CVD Smart Money Analysis
  const { macdHistBars, emaSvg, cvdInfo } = useMemo(() => {
    if (!candles || candles.length < 35) {
      return { macdHistBars: [] as number[], emaSvg: null, cvdInfo: null };
    }
    const macdRes = calculateMACD(candles, 12, 26, 9);
    const bars = macdRes.histogram.slice(-20).map((p) => p.value);

    const e20 = calculateEMA(candles, 20).slice(-20).map((p) => p.value);
    const e50 = calculateEMA(candles, 50).slice(-20).map((p) => p.value);

    // CVD (Cumulative Volume Delta) & Divergence over last 16 candles
    const recent = candles.slice(-16);
    let cumDeltaUsd = 0;
    let totalVolUsd = 0;
    const cvdSeries: number[] = [];
    for (const c of recent) {
      const buyVol = c.taker_buy_volume ?? c.volume * 0.5;
      const sellVol = Math.max(0, c.volume - buyVol);
      const deltaUsd = (buyVol - sellVol) * c.close;
      cumDeltaUsd += deltaUsd;
      totalVolUsd += c.volume * c.close;
      cvdSeries.push(cumDeltaUsd);
    }

    const firstPrice = recent[0]?.open || 1;
    const lastPrice = recent[recent.length - 1]?.close || firstPrice;
    const priceChangePct = ((lastPrice - firstPrice) / firstPrice) * 100;
    const netDeltaRatio = totalVolUsd > 0 ? cumDeltaUsd / totalVolUsd : 0;

    let badge = "⚖️ DENGELİ AKIŞ";
    let tone: "pos" | "neg" | "neu" = "neu";
    let summary = "Fiyat hareketi ve emir akışı dengeli ilerliyor.";

    if (priceChangePct <= 0.35 && netDeltaRatio >= 0.06) {
      badge = "🟢 GİZLİ TOPLAMA (POZİTİF CVD)";
      tone = "pos";
      summary = `Son 16 mumda fiyat yatay/sakin (%${priceChangePct.toFixed(2)}) kalırken içeriden net alıcı birikimi var (Patlama Öncesi Toplama).`;
    } else if (priceChangePct >= 0.4 && netDeltaRatio <= -0.04) {
      badge = "🛡️ TUZAK UYARISI (SAHTE PUMP)";
      tone = "neg";
      summary = `Fiyat yükselirken (%+${priceChangePct.toFixed(2)}) büyük emirler satış tarafında; sahte yükseliş (Bull Trap) riskine dikkat!`;
    } else if (priceChangePct > 0.25 && netDeltaRatio > 0.05) {
      badge = "🔥 GERÇEK PARA ONAYLI YÜKSELİŞ";
      tone = "pos";
      summary = `Fiyat yükselişi (%+${priceChangePct.toFixed(2)}) güçlü Taker alımlarıyla (pozitif CVD) destekleniyor.`;
    } else if (netDeltaRatio <= -0.06) {
      badge = "📉 AĞIR SATIŞ BASKISI";
      tone = "neg";
      summary = `Son mumlarda agresif piyasa satışları baskın; destek kırılımlarına dikkat edilmeli.`;
    }

    const cvdMin = Math.min(...cvdSeries);
    const cvdMax = Math.max(...cvdSeries);
    const cvdSpan = cvdMax - cvdMin || 1;
    const cvdPts = cvdSeries
      .map((v, idx) => {
        const x = (idx / Math.max(1, cvdSeries.length - 1)) * 156 + 2;
        const y = 34 - ((v - cvdMin) / cvdSpan) * 28;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    const computedCvd = {
      cumDeltaUsd,
      badge,
      tone,
      summary,
      cvdPts,
    };

    if (e20.length < 2 || e50.length < 2) {
      return { macdHistBars: bars, emaSvg: null, cvdInfo: computedCvd };
    }
    const len = Math.min(e20.length, e50.length);
    const s20 = e20.slice(-len);
    const s50 = e50.slice(-len);
    const all = [...s20, ...s50];
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min || 1;

    const toPts = (arr: number[]) =>
      arr
        .map((v, idx) => {
          const x = (idx / (len - 1)) * 156 + 2;
          const y = 38 - ((v - min) / span) * 30;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");

    const lastY20 = 38 - ((s20[s20.length - 1] - min) / span) * 30;
    return {
      macdHistBars: bars,
      emaSvg: {
        pts20: toPts(s20),
        pts50: toPts(s50),
        lastY20: Number(lastY20.toFixed(1)),
      },
      cvdInfo: computedCvd,
    };
  }, [candles]);

  // VWAP price difference calculation
  let vwapDiffPct: number | null = null;
  let vwapStatus = "—";
  let vwapStClass = "neu";
  if (currentPrice !== null && ind?.vwap) {
    vwapDiffPct = ((currentPrice - ind.vwap) / ind.vwap) * 100;
    if (vwapDiffPct >= 0) {
      vwapStatus = `+${vwapDiffPct.toFixed(2)}% (FİYAT ÜSTTE)`;
      vwapStClass = "pos";
    } else {
      vwapStatus = `${vwapDiffPct.toFixed(2)}% (FİYAT ALTTA)`;
      vwapStClass = "neg";
    }
  }

  // Bollinger Bands position calculation
  let bbStatus = "—";
  let bbStClass = "neu";
  if (currentPrice !== null && ind?.bb_upper && ind?.bb_lower) {
    if (currentPrice > ind.bb_upper) {
      bbStatus = "ÜST BANT KIRILIMI";
      bbStClass = "neg";
    } else if (currentPrice < ind.bb_lower) {
      bbStatus = "ALT BANT KIRILIMI";
      bbStClass = "pos";
    } else {
      bbStatus = "BANT İÇİ DENGELİ";
      bbStClass = "neu";
    }
  }

  // Volume ratio calculation
  let volRatioText = "—";
  let volPct = 0;
  if (ind?.current_volume && ind?.volume_ma && ind.volume_ma > 0) {
    const ratio = (ind.current_volume / ind.volume_ma) * 100;
    volPct = Math.min(ratio, 100);
    volRatioText = `%${ratio.toFixed(0)}`;
  }

  // Common card classes mapping the Pro Terminal Dark style
  const cardClass = "min-w-0 bg-gradient-to-br from-[var(--card-2)] to-[var(--card)] border border-[var(--line)] hover:border-white/15 transition-colors duration-200 rounded-[18px] p-4 flex flex-col gap-3 shadow-[0_8px_24px_rgba(0,0,0,0.3)]";
  const chClass = "flex items-center gap-2 min-h-[22px]";
  const h2Class = "m-0 text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--ink-dim)]";
  const vrowClass = "flex items-end justify-between gap-2.5 flex-wrap";
  const vClass = "font-mono text-[26px] font-semibold leading-[1.05] tabular-nums tracking-[-0.01em]";
  const vWordClass = "font-sans font-bold tracking-normal text-[24px]";
  const sClass = "m-0 font-mono text-[11px] text-[var(--ink-dim)] leading-[1.5]";

  const getStClass = (type: string) => {
    const base = "inline-flex font-mono font-bold text-[10px] leading-none tracking-[0.08em] uppercase px-2.5 py-1.5 rounded-lg border whitespace-nowrap";
    if (type === "pos") return `${base} text-[var(--gain)] bg-[rgba(47,214,161,0.1)] border-[rgba(47,214,161,0.35)]`;
    if (type === "neg") return `${base} text-[var(--loss)] bg-[rgba(255,90,110,0.1)] border-[rgba(255,90,110,0.35)]`;
    return `${base} text-[var(--warn)] bg-[rgba(245,177,61,0.1)] border-[rgba(245,177,61,0.35)]`;
  };

  const formatVolumeShort = (volume: number): string => {
    if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(1)}B`;
    if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
    if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`;
    return volume.toFixed(1);
  };

  // EMA Difference
  const emaDiff = ind?.ema_20 && ind?.ema_50 ? ind.ema_20 - ind.ema_50 : 0;
  
  // RSI Status
  const getRsiInfo = (rsi: number | null) => {
    if (!rsi) return { st: "neu", txt: "Nötr" };
    if (rsi >= 70) return { st: "neg", txt: "Aşırı Alım (>70)" };
    if (rsi >= 60) return { st: "pos", txt: "Güçlü (60-70)" };
    if (rsi >= 40) return { st: "neu", txt: "Nötr (40-60)" };
    if (rsi >= 30) return { st: "neg", txt: "Zayıf (30-40)" };
    return { st: "pos", txt: "Aşırı Satım (<30)" };
  };
  const rsiInfo = getRsiInfo(ind?.rsi ?? null);

  // Buy/Sell Pressure
  const buyPct = ind?.buy_pressure_pct ?? 50;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      
      {/* 1. RSI */}
      <section className={cardClass} aria-label="RSI">
        <div className={chClass}>
          <Activity className="w-4 h-4 text-[var(--ink-dim)]" />
          <h2 className={h2Class}>RSI (14)</h2>
        </div>
        <div className={vrowClass}>
          <div className={vClass}>{ind?.rsi ? ind.rsi.toFixed(1) : "—"}</div>
          <span className={getStClass(rsiInfo.st)}>{rsiInfo.txt}</span>
        </div>
        <div className="relative">
          <div className="relative h-2 rounded-full bg-[var(--track)]" style={{ background: "linear-gradient(90deg, rgba(47,214,161,.28) 0 30%, var(--track) 30% 70%, rgba(255,90,110,.28) 70% 100%)" }}>
            <span className="absolute top-[-3px] bottom-[-3px] w-[1.5px] bg-[var(--ink-faint)]" style={{ left: "30%" }} />
            <span className="absolute top-[-3px] bottom-[-3px] w-[1.5px] bg-[var(--ink-faint)]" style={{ left: "70%" }} />
            {ind?.rsi && (
              <span className="absolute top-1/2 w-3.5 h-3.5 -mt-[7px] -ml-[7px] rounded-full bg-[var(--ink)] border-[3px] border-[var(--ground)] shadow-[0_0_0_1.5px_var(--ink-dim)]" style={{ left: `${Math.min(100, Math.max(0, ind.rsi))}%` }} />
            )}
          </div>
          <div className="relative h-3 block font-mono text-[10px] text-[var(--ink-faint)] mt-1.5">
            <span className="absolute -translate-x-1/2 left-0 transform-none">0</span>
            <span className="absolute -translate-x-1/2 left-[30%]">30</span>
            <span className="absolute -translate-x-1/2 left-[70%]">70</span>
            <span className="absolute -translate-x-[100%] left-full">100</span>
          </div>
        </div>
        <p className={sClass}>Referans: <b className="text-[var(--ink)] font-medium">30 / 70</b></p>
      </section>

      {/* 2. MACD */}
      <section className={cardClass} aria-label="MACD">
        <div className={chClass}>
          <BarChart3 className="w-4 h-4 text-[var(--ink-dim)]" />
          <h2 className={h2Class}>MACD (12,26,9)</h2>
        </div>
        <div className={vrowClass}>
          <div className={`${vClass} ${ind?.macd_trend === "bearish" ? "text-[var(--loss)]" : ind?.macd_trend === "bullish" ? "text-[var(--gain)]" : ""}`}>
            {ind?.macd_histogram ? ind.macd_histogram.toFixed(4) : "—"}
          </div>
          <span className={getStClass(ind?.macd_trend === "bullish" ? "pos" : ind?.macd_trend === "bearish" ? "neg" : "neu")}>
            {ind?.macd_trend === "bullish" ? "Yükseliş" : ind?.macd_trend === "bearish" ? "Düşüş" : "Nötr"}
          </span>
        </div>
        <div>
          <svg viewBox="0 0 160 44" className="w-full h-auto block" role="img" aria-label="MACD">
            <line x1="0" x2="160" y1="22" y2="22" stroke="var(--line)" strokeWidth="1" />
            {macdHistBars.length > 0 && (() => {
              const maxAbs = Math.max(...macdHistBars.map((v) => Math.abs(v)), 0.0001);
              const w = 160 / macdHistBars.length;
              return macdHistBars.map((v, i) => {
                const isUp = v >= 0;
                const h = Math.max(1.5, (Math.abs(v) / maxAbs) * 18);
                return (
                  <rect
                    key={i}
                    x={i * w + 1}
                    y={isUp ? 22 - h : 23}
                    width={Math.max(2, w - 3)}
                    height={h}
                    rx={1.5}
                    fill={isUp ? "var(--gain)" : "var(--loss)"}
                    opacity={i === macdHistBars.length - 1 ? 1 : 0.6}
                  />
                );
              });
            })()}
          </svg>
        </div>
        <p className={sClass}>
          M: <b className="text-[var(--ink)] font-medium">{ind?.macd_line?.toFixed(2) ?? "—"}</b> &nbsp;|&nbsp; 
          S: <b className="text-[var(--ink)] font-medium">{ind?.macd_signal?.toFixed(2) ?? "—"}</b>
        </p>
      </section>

      {/* 3. EMA Trend */}
      <section className={cardClass} aria-label="EMA trend">
        <div className={chClass}>
          <TrendingUp className="w-4 h-4 text-[var(--ink-dim)]" />
          <h2 className={h2Class}>EMA Trend</h2>
        </div>
        <div className={vrowClass}>
          <div className={`${vClass} ${vWordClass} ${ind?.ema_trend === "bearish_cross" ? "text-[var(--loss)]" : ind?.ema_trend === "bullish_cross" ? "text-[var(--gain)]" : ""}`}>
            {ind?.ema_trend === "bullish_cross" ? "Yükseliş" : ind?.ema_trend === "bearish_cross" ? "Düşüş" : "Nötr"}
          </div>
          <span className={getStClass(ind?.ema_trend === "bullish_cross" ? "pos" : ind?.ema_trend === "bearish_cross" ? "neg" : "neu")}>
            {ind?.ema_trend === "bullish_cross" ? "Boğa (20 > 50)" : ind?.ema_trend === "bearish_cross" ? "Ayı (20 < 50)" : "Nötr"}
          </span>
        </div>
        <div>
          <svg viewBox="0 0 160 44" className="w-full h-auto block" role="img" aria-label="EMA Trend">
            {emaSvg ? (
              <>
                <polyline points={emaSvg.pts50} fill="none" stroke="#a98791" strokeWidth="1.6" strokeDasharray="4 3" strokeLinecap="round" />
                <polyline points={emaSvg.pts20} fill="none" stroke={emaDiff >= 0 ? "var(--gain)" : "var(--loss)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="158" cy={emaSvg.lastY20} r="3" fill={emaDiff >= 0 ? "var(--gain)" : "var(--loss)"} />
              </>
            ) : (
              <line x1="0" x2="160" y1="22" y2="22" stroke="var(--line)" strokeWidth="1" strokeDasharray="4 3" />
            )}
          </svg>
          <div className="flex gap-3 font-mono text-[10px] text-[var(--ink-dim)] mt-1.5">
            <span className="flex items-center gap-1.5"><i className={`w-3 h-0.5 inline-block ${emaDiff >= 0 ? "bg-[var(--gain)]" : "bg-[var(--loss)]"}`} />EMA20</span>
            <span className="flex items-center gap-1.5"><i className="w-3 h-0.5 inline-block bg-[#a98791]" />EMA50</span>
          </div>
        </div>
        <p className={sClass}>
          20: <b className="text-[var(--ink)] font-medium">{ind?.ema_20 ? ind.ema_20.toFixed(2) : "—"}</b> &nbsp;|&nbsp; 
          50: <b className="text-[var(--ink)] font-medium">{ind?.ema_50 ? ind.ema_50.toFixed(2) : "—"}</b> &nbsp;|&nbsp; 
          Fark: <b className={emaDiff >= 0 ? "text-[var(--gain)]" : "text-[var(--loss)]"}>{emaDiff.toFixed(2)}</b>
        </p>
      </section>

      {/* 4. Bollinger */}
      <section className={cardClass} aria-label="Bollinger">
        <div className={chClass}>
          <Maximize2 className="w-4 h-4 text-[var(--ink-dim)]" />
          <h2 className={h2Class}>Bollinger (20,2)</h2>
        </div>
        <div className={vrowClass}>
          <div className={vClass}>${currentPrice ? formatPrice(currentPrice) : "—"}</div>
          <span className={getStClass(bbStClass)}>{bbStatus}</span>
        </div>
        <div>
          <div className="relative h-2 rounded-full bg-[var(--track)]" style={{ background: "linear-gradient(90deg, rgba(47,214,161,.22), var(--track) 25% 75%, rgba(255,90,110,.22))" }}>
            <span className="absolute top-[-3px] bottom-[-3px] w-[1.5px] bg-[var(--ink-faint)] left-1/2" />
            {currentPrice && ind?.bb_lower && ind?.bb_upper && (
              <span className="absolute top-1/2 w-3.5 h-3.5 -mt-[7px] -ml-[7px] rounded-full bg-[var(--ink)] border-[3px] border-[var(--ground)] shadow-[0_0_0_1.5px_var(--ink-dim)]" style={{ left: `${Math.min(100, Math.max(0, ((currentPrice - ind.bb_lower) / (ind.bb_upper - ind.bb_lower)) * 100))}%` }} />
            )}
          </div>
          <div className="flex justify-between font-mono text-[10px] text-[var(--ink-faint)] mt-1.5">
            <span>{ind?.bb_lower ? ind.bb_lower.toFixed(2) : "Alt"}</span>
            <span>Orta</span>
            <span>{ind?.bb_upper ? ind.bb_upper.toFixed(2) : "Üst"}</span>
          </div>
        </div>
        <p className={sClass}>
          Alt: <b className="text-[var(--ink)] font-medium">{ind?.bb_lower ? ind.bb_lower.toFixed(2) : "—"}</b> &nbsp;|&nbsp; 
          Üst: <b className="text-[var(--ink)] font-medium">{ind?.bb_upper ? ind.bb_upper.toFixed(2) : "—"}</b>
        </p>
      </section>

      {/* 5. VWAP */}
      <section className={cardClass} aria-label="VWAP">
        <div className={chClass}>
          <Gauge className="w-4 h-4 text-[var(--ink-dim)]" />
          <h2 className={h2Class}>VWAP</h2>
        </div>
        <div className={vrowClass}>
          <div className={vClass}>${ind?.vwap ? formatPrice(ind.vwap) : "—"}</div>
          <span className={getStClass(vwapStClass)}>{vwapStatus}</span>
        </div>
        <div>
          <div className="relative h-2 rounded-full bg-[var(--track)]">
            <span className="absolute top-[-3px] bottom-[-3px] w-[1.5px] bg-[var(--ink-faint)] left-1/2" />
            {vwapDiffPct !== null && (
              <>
                <span className="absolute inset-y-0 rounded-full" 
                  style={{ 
                    left: vwapDiffPct > 0 ? "50%" : `${Math.max(0, 50 + vwapDiffPct * (50/5))}%`, 
                    width: `${Math.min(50, Math.abs(vwapDiffPct * (50/5)))}%`, 
                    background: vwapDiffPct > 0 ? "rgba(47,214,161,.45)" : "rgba(255,90,110,.45)" 
                  }} 
                />
                <span className="absolute top-1/2 w-3.5 h-3.5 -mt-[7px] -ml-[7px] rounded-full bg-[var(--ink)] border-[3px] border-[var(--ground)] shadow-[0_0_0_1.5px_var(--ink-dim)]" style={{ left: `${Math.min(100, Math.max(0, 50 + vwapDiffPct * (50/5)))}%` }} />
              </>
            )}
          </div>
          <div className="flex justify-between font-mono text-[10px] text-[var(--ink-faint)] mt-1.5">
            <span>-5%</span><span>VWAP</span><span>+5%</span>
          </div>
        </div>
        <p className={sClass}>Günlük hacim ağırlıklı ortalama</p>
      </section>

      {/* 6. Hacim & 20 MA */}
      <section className={cardClass} aria-label="Hacim ve 20 MA">
        <div className={chClass}>
          <Waves className="w-4 h-4 text-[var(--ink-dim)]" />
          <h2 className={h2Class}>Hacim &amp; 20 MA</h2>
        </div>
        <div className={vrowClass}>
          <div className={vClass}>{ind?.current_volume ? formatVolumeShort(ind.current_volume) : "—"}</div>
          <span className={getStClass(ind?.current_volume && ind?.volume_ma && ind.current_volume > ind.volume_ma ? "pos" : "neu")}>
            {ind?.current_volume && ind?.volume_ma ? (ind.current_volume > ind.volume_ma ? "ORT. ÜSTÜ" : "ORT. ALTI") : "—"}
          </span>
        </div>
        <div>
          <div className="relative h-2 rounded-full bg-[var(--track)]">
            <span className={`absolute inset-y-0 left-0 rounded-full ${volPct >= 100 ? "bg-[var(--gain)]" : "bg-[var(--warn)]"}`} style={{ width: `${Math.min(100, volPct)}%` }} />
            <span className="absolute top-[-3px] bottom-[-3px] w-[1.5px] bg-[var(--ink-faint)] right-0" />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-[var(--ink-faint)] mt-1.5">
            <span>0</span><span>20 MA: {ind?.volume_ma ? formatVolumeShort(ind.volume_ma) : "—"}</span>
          </div>
        </div>
        <p className={sClass}>Ortalamanın <b className="text-[var(--ink)] font-medium">{volRatioText}</b>&apos;ü</p>
      </section>

      {/* 7. Alıcı / Satıcı Baskısı & CVD Akıllı Para Analizi */}
      <section className={`${cardClass} md:col-span-2 lg:col-span-3`} aria-label="Alıcı satıcı baskısı">
        <div className="flex flex-wrap items-center justify-between gap-2 min-h-[22px]">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[var(--ink-dim)]" />
            <h2 className={h2Class}>Alıcı / Satıcı Baskısı &amp; CVD Akıllı Para Analizi</h2>
          </div>
          {cvdInfo && (
            <span className={getStClass(cvdInfo.tone)}>
              {cvdInfo.badge}
            </span>
          )}
        </div>
        <div className={vrowClass}>
          <div className={vClass}>%{buyPct.toFixed(1)} <span className="font-sans text-[18px]">Alım</span></div>
          <div className="flex items-center gap-2 flex-wrap">
            {cvdInfo && (
              <span className={`font-mono text-xs font-bold ${cvdInfo.cumDeltaUsd >= 0 ? "text-[var(--gain)]" : "text-[var(--loss)]"}`}>
                Net CVD: {cvdInfo.cumDeltaUsd >= 0 ? "+" : "-"}${formatVolumeShort(Math.abs(cvdInfo.cumDeltaUsd))}
              </span>
            )}
            <span className={getStClass(buyPct > 50 ? "pos" : "neg")}>
              {buyPct > 50 ? "Alıcılar güçlü" : "Satıcılar güçlü"}
            </span>
          </div>
        </div>
        <div>
          <div className="flex h-[10px] rounded-full overflow-hidden gap-[2px]">
            <i className="block h-full bg-[var(--gain)]" style={{ width: `${buyPct}%` }} />
            <i className="block h-full bg-[var(--loss)]" style={{ width: `${100 - buyPct}%` }} />
          </div>
          <div className="flex justify-between font-mono text-[10px] mt-1.5">
            <span className="text-[var(--gain)]">Alım %{buyPct.toFixed(1)}</span>
            <span className="text-[var(--loss)]">Satım %{(100 - buyPct).toFixed(1)}</span>
          </div>
        </div>

        {/* CVD Uyumsuzluk & Akıllı Para Özeti + Mini Eğri */}
        {cvdInfo && (
          <div className="pt-2 border-t border-dashed border-[var(--line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="m-0 text-xs text-[var(--ink)] font-sans leading-relaxed">
              {cvdInfo.summary}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono text-[var(--ink-dim)] uppercase">CVD Eğrisi (16m):</span>
              <svg viewBox="0 0 160 38" className="w-28 h-7 block overflow-visible">
                <polyline
                  points={cvdInfo.cvdPts}
                  fill="none"
                  stroke={cvdInfo.cumDeltaUsd >= 0 ? "var(--gain)" : "var(--loss)"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
