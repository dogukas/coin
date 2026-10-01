"use client";

// Indicator Grid — mini-cards showing live RSI, MACD, EMA, Bollinger Bands, VWAP, Volume stats

import { useDashboardStore } from "@/lib/store";
import { formatNumber, formatPrice } from "@/lib/utils";
import {
  Activity,
  BarChart3,
  TrendingUp,
  Waves,
  Maximize2,
  Gauge,
} from "lucide-react";

export default function IndicatorGrid() {
  const signalData = useDashboardStore((s) => s.signalData);
  const ind = signalData?.indicators;
  const currentPrice = signalData?.price ?? null;

  // VWAP price difference calculation
  let vwapDiffPct: number | null = null;
  let vwapStatus = "—";
  let vwapColor = "#9ca3af";
  if (currentPrice !== null && ind?.vwap) {
    vwapDiffPct = ((currentPrice - ind.vwap) / ind.vwap) * 100;
    if (vwapDiffPct >= 0) {
      vwapStatus = `+${vwapDiffPct.toFixed(2)}% (FİYAT ÜSTTE)`;
      vwapColor = "#00e676";
    } else {
      vwapStatus = `${vwapDiffPct.toFixed(2)}% (FİYAT ALTTA)`;
      vwapColor = "#ef5350";
    }
  }

  // Bollinger Bands position calculation
  let bbStatus = "—";
  let bbColor = "#9ca3af";
  if (currentPrice !== null && ind?.bb_upper && ind?.bb_lower) {
    if (currentPrice > ind.bb_upper) {
      bbStatus = "ÜST BANT KIRILIMI";
      bbColor = "#ef5350";
    } else if (currentPrice < ind.bb_lower) {
      bbStatus = "ALT BANT KIRILIMI";
      bbColor = "#00e676";
    } else {
      bbStatus = "BANT İÇİ DENGELİ";
      bbColor = "#66bb6a";
    }
  }

  // Volume ratio calculation
  let volRatioText = "—";
  let volBarValue = 0;
  if (ind?.current_volume && ind?.volume_ma && ind.volume_ma > 0) {
    const ratio = (ind.current_volume / ind.volume_ma) * 100;
    volRatioText = `%${ratio.toFixed(0)} Oran`;
    volBarValue = ratio;
  }

  // MACD Bar Calculation (-0.5% to +0.5% mapping)
  let macdBarValue = 50;
  if (ind?.macd_histogram !== undefined && ind?.macd_histogram !== null && currentPrice) {
     const histPct = (ind.macd_histogram / currentPrice) * 100; 
     macdBarValue = Math.max(0, Math.min(100, 50 + (histPct * 100)));
  }

  // EMA Bar Calculation (Price vs EMA50, -5% to +5% mapping)
  let emaBarValue = 50;
  if (currentPrice && ind?.ema_50) {
    const diffPct = ((currentPrice - ind.ema_50) / ind.ema_50) * 100;
    emaBarValue = Math.max(0, Math.min(100, 50 + (diffPct * 10)));
  }

  // Bollinger Bar Calculation (Price position between bands)
  let bbBarValue = 50;
  if (currentPrice && ind?.bb_upper && ind?.bb_lower) {
    const range = ind.bb_upper - ind.bb_lower;
    if (range > 0) {
      bbBarValue = Math.max(0, Math.min(100, ((currentPrice - ind.bb_lower) / range) * 100));
    }
  }

  // VWAP Bar Calculation (-3% to +3% mapping)
  let vwapBarValue = 50;
  if (vwapDiffPct !== null) {
    vwapBarValue = Math.max(0, Math.min(100, 50 + (vwapDiffPct * (50/3))));
  }

  return (
    <>
    <div className="grid grid-cols-2 gap-3">
      {/* 1. RSI Card */}
      <IndicatorMiniCard
        icon={<Activity size={14} />}
        label="RSI (14)"
        value={ind?.rsi !== null && ind?.rsi !== undefined ? ind.rsi.toFixed(1) : "—"}
        subInfo="Referans: 30 / 70"
        status={getRsiStatus(ind?.rsi ?? null)}
        color={getRsiColor(ind?.rsi ?? null)}
        barValue={ind?.rsi ?? 0}
        barMax={100}
        barGradient={getRsiBarGradient(ind?.rsi ?? 0)}
      />

      {/* 2. MACD Card */}
      <IndicatorMiniCard
        icon={<BarChart3 size={14} />}
        label="MACD (12,26,9)"
        value={
          ind?.macd_histogram !== null && ind?.macd_histogram !== undefined
            ? (ind.macd_histogram > 0 ? "+" : "") + ind.macd_histogram.toFixed(4)
            : "—"
        }
        subInfo={
          ind?.macd_line !== null && ind?.macd_signal !== null && ind?.macd_line !== undefined && ind?.macd_signal !== undefined
            ? `M: ${ind.macd_line.toFixed(2)} | S: ${ind.macd_signal.toFixed(2)}`
            : undefined
        }
        status={ind?.macd_trend === "bullish" ? "YÜKSELİŞ" : ind?.macd_trend === "bearish" ? "DÜŞÜŞ" : "—"}
        color={ind?.macd_trend === "bullish" ? "#00e676" : ind?.macd_trend === "bearish" ? "#ef5350" : "#9ca3af"}
        barValue={macdBarValue}
        barMax={100}
        barGradient={macdBarValue >= 50 ? "#66bb6a, #00e676" : "#ef5350, #ff1744"}
      />

      {/* 3. EMA Trend Card */}
      <IndicatorMiniCard
        icon={<TrendingUp size={14} />}
        label="EMA Trend"
        value={getEmaTrendLabel(ind?.ema_trend ?? null)}
        subInfo={
          ind?.ema_20 && ind?.ema_50
            ? `20: ${formatShortPrice(ind.ema_20)} | 50: ${formatShortPrice(ind.ema_50)}`
            : undefined
        }
        status={
          ind?.ema_trend === "bullish_cross"
            ? "BOĞA (20 > 50)"
            : ind?.ema_trend === "bearish_cross"
            ? "AYI (20 < 50)"
            : "NÖTR"
        }
        color={
          ind?.ema_trend === "bullish_cross"
            ? "#00e676"
            : ind?.ema_trend === "bearish_cross"
            ? "#ef5350"
            : "#9ca3af"
        }
        barValue={emaBarValue}
        barMax={100}
        barGradient={emaBarValue >= 50 ? "#66bb6a, #00e676" : "#ef5350, #ff1744"}
      />

      {/* 4. Bollinger Bands Card */}
      <IndicatorMiniCard
        icon={<Maximize2 size={14} />}
        label="Bollinger (20,2)"
        value={ind?.bb_middle ? `$${formatPrice(ind.bb_middle)}` : "—"}
        subInfo={
          ind?.bb_upper && ind?.bb_lower
            ? `Alt: ${formatShortPrice(ind.bb_lower)} | Üst: ${formatShortPrice(ind.bb_upper)}`
            : undefined
        }
        status={bbStatus}
        color={bbColor}
        barValue={bbBarValue}
        barMax={100}
        barGradient={bbBarValue > 80 ? "#ef5350, #ff1744" : bbBarValue < 20 ? "#66bb6a, #00e676" : "#ffc107, #ffab00"}
      />

      {/* 5. VWAP Card */}
      <IndicatorMiniCard
        icon={<Gauge size={14} />}
        label="VWAP"
        value={ind?.vwap ? `$${formatPrice(ind.vwap)}` : "—"}
        subInfo={ind?.vwap ? "Günlük Hacim Ağır. Ort." : undefined}
        status={vwapStatus}
        color={vwapColor}
        barValue={vwapBarValue}
        barMax={100}
        barGradient={vwapBarValue >= 50 ? "#66bb6a, #00e676" : "#ef5350, #ff1744"}
      />

      {/* 6. Volume Card */}
      <IndicatorMiniCard
        icon={<Waves size={14} />}
        label="Hacim & 20 MA"
        value={
          ind?.current_volume !== null && ind?.current_volume !== undefined
            ? formatVolumeShort(ind.current_volume)
            : "—"
        }
        subInfo={
          ind?.volume_ma
            ? `20 MA: ${formatVolumeShort(ind.volume_ma)} (${volRatioText})`
            : undefined
        }
        status={
          ind?.current_volume && ind?.volume_ma
            ? ind.current_volume > ind.volume_ma
              ? "ORT. ÜSTÜ"
              : "ORT. ALTI"
            : "—"
        }
        color={
          ind?.current_volume && ind?.volume_ma && ind.current_volume > ind.volume_ma
            ? "#00e676"
            : "#ef5350"
        }
        barValue={Math.min(200, volBarValue)}
        barMax={200}
        barGradient={volBarValue > 100 ? "#00e676, #66bb6a" : "#ffc107, #ff9800"}
      />
    </div>
      
      {/* 7. Buy vs Sell Pressure Card (Full Width) */}
      <div className="mt-3">
        <IndicatorMiniCard
          icon={<Activity size={14} />}
          label="Alıcı / Satıcı Baskısı (Taker Buy)"
          value={
            ind?.buy_pressure_pct !== undefined && ind?.buy_pressure_pct !== null
              ? `%${ind.buy_pressure_pct.toFixed(1)} Alım`
              : "—"
          }
          subInfo={
            ind?.buy_pressure_pct !== undefined && ind?.buy_pressure_pct !== null
              ? `Satım: %${(100 - ind.buy_pressure_pct).toFixed(1)}`
              : undefined
          }
          status={
            ind?.buy_pressure_pct !== undefined && ind?.buy_pressure_pct !== null
              ? ind.buy_pressure_pct > 50
                ? "ALICILAR GÜÇLÜ"
                : "SATICILAR GÜÇLÜ"
              : "—"
          }
          color={
            ind?.buy_pressure_pct !== undefined && ind?.buy_pressure_pct !== null
              ? ind.buy_pressure_pct > 50
                ? "#00e676"
                : "#ef5350"
              : "#9ca3af"
          }
          barValue={ind?.buy_pressure_pct ?? 0}
          barMax={100}
          barGradient="#00e676, #ef5350"
        />
      </div>
    </>
  );
}

// ──────────────────────────────────────────────
// Mini Card Component
// ──────────────────────────────────────────────

function IndicatorMiniCard({
  icon,
  label,
  value,
  subInfo,
  status,
  color,
  barValue,
  barMax,
  barGradient,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subInfo?: string;
  status: string;
  color: string;
  barValue?: number;
  barMax?: number;
  barGradient?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/5 p-3 backdrop-blur-2xl transition-all duration-500 hover:border-white/20 hover:shadow-lg flex flex-col justify-between group ${className}`}
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
        boxShadow: `0 4px 20px 0 rgba(0,0,0,0.2)`,
      }}
    >
      {/* Hover Glow */}
      <div 
        className="absolute -top-10 -right-10 w-20 h-20 rounded-full blur-[40px] opacity-0 group-hover:opacity-20 transition-opacity duration-700 pointer-events-none"
        style={{ backgroundColor: color }}
      />
      
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-gray-400 group-hover:text-white transition-colors">{icon}</span>
          <span className="text-[10px] font-bold text-gray-400 group-hover:text-gray-200 uppercase tracking-widest truncate transition-colors">
            {label}
          </span>
        </div>

        {/* Value */}
        <div className="text-lg font-black text-white tabular-nums tracking-tight mb-0.5 truncate drop-shadow-md">
          {value}
        </div>

        {/* Sub info (e.g. secondary values) */}
        {subInfo && (
          <div className="text-[9px] font-mono font-medium text-gray-500 truncate mb-1">
            {subInfo}
          </div>
        )}
      </div>

      <div className="mt-2 relative z-10">
        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-black px-1.5 py-0.5 rounded shadow-sm tracking-widest truncate uppercase"
            style={{
              backgroundColor: `${color}15`,
              color: color,
              border: `1px solid ${color}30`,
            }}
          >
            {status}
          </span>
        </div>

        {/* Optional bar (for RSI) */}
        {barValue !== undefined && barMax !== undefined && (
          <div className="mt-2 w-full h-1.5 rounded-full bg-black/40 overflow-hidden relative shadow-inner">
            {/* Guide markers at 30% and 70% */}
            <div className="absolute left-[30%] top-0 bottom-0 w-[1px] bg-white/20 z-10" />
            <div className="absolute left-[70%] top-0 bottom-0 w-[1px] bg-white/20 z-10" />
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${Math.min(100, Math.max(0, (barValue / barMax) * 100))}%`,
                background: barGradient ? `linear-gradient(90deg, ${barGradient})` : color,
                boxShadow: `0 0 10px ${color}50`
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────

function getRsiStatus(rsi: number | null): string {
  if (rsi === null) return "—";
  if (rsi >= 70) return "AŞIRI ALIM (>70)";
  if (rsi >= 60) return "GÜÇLÜ (60-70)";
  if (rsi >= 40) return "NÖTR (40-60)";
  if (rsi >= 30) return "ZAYIF (30-40)";
  return "AŞIRI SATIM (<30)";
}

function getRsiColor(rsi: number | null): string {
  if (rsi === null) return "#9ca3af";
  if (rsi >= 70) return "#ef5350";
  if (rsi >= 60) return "#66bb6a";
  if (rsi >= 40) return "#ffc107";
  if (rsi >= 30) return "#ff9800";
  return "#ef5350";
}

function getRsiBarGradient(rsi: number): string {
  if (rsi >= 70) return "#ef5350, #ff1744";
  if (rsi >= 60) return "#66bb6a, #00e676";
  if (rsi >= 40) return "#ffc107, #ffab00";
  if (rsi >= 30) return "#ff9800, #ff6d00";
  return "#ef5350, #ff1744";
}

function getEmaTrendLabel(trend: string | null): string {
  switch (trend) {
    case "bullish_cross":
      return "YÜKSELİŞ";
    case "bearish_cross":
      return "DÜŞÜŞ";
    default:
      return "NÖTR";
  }
}

function formatShortPrice(val: number): string {
  if (val >= 1000) {
    return `${(val / 1000).toFixed(1)}k`;
  }
  return val.toFixed(2);
}

function formatVolumeShort(volume: number): string {
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(1)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`;
  return volume.toFixed(1);
}
