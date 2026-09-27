"use client";

// Signal Card — displays score gauge, label badge, and reasoning bullets
// Glassmorphism card with dynamic glow based on signal strength

import { useDashboardStore } from "@/lib/store";
import {
  formatPrice,
  getSignalColor,
  getSignalGlow,
  getSignalLevel,
} from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react";

export default function SignalCard() {
  const signalData = useDashboardStore((s) => s.signalData);

  const score = signalData?.score ?? 0;
  const label = signalData?.label ?? "BEKLE / NÖTR";
  const price = signalData?.price ?? 0;
  const reasons = signalData?.reasons ?? [];
  const color = getSignalColor(score);
  const glow = getSignalGlow(score);
  const level = getSignalLevel(score);

  // Score gauge — SVG circle
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  const TrendIcon =
    level === "strong_buy" || level === "buy"
      ? TrendingUp
      : level === "sell"
      ? TrendingDown
      : Minus;

  return (
    <div
      className="rounded-2xl border border-white/10 p-5 backdrop-blur-2xl transition-all duration-700 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
        boxShadow: `0 8px 32px 0 rgba(0,0,0,0.3), ${glow}`,
      }}
    >
      {/* Dynamic background glow based on score */}
      <div 
        className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-[80px] opacity-40 transition-colors duration-1000"
        style={{ backgroundColor: color }}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-widest drop-shadow-sm">
          Sinyal Durumu
        </h3>
        <span
          className="px-4 py-1.5 rounded-full text-xs font-black transition-all duration-500 shadow-lg tracking-wide"
          style={{
            backgroundColor: `${color}15`,
            color: color,
            border: `1px solid ${color}40`,
            boxShadow: `0 0 20px ${color}20`
          }}
        >
          {label}
        </span>
      </div>

      {/* Score Gauge */}
      <div className="flex items-center gap-5 mb-5">
        <div className="relative w-32 h-32 flex-shrink-0">
          <svg
            className="w-full h-full transform -rotate-90"
            viewBox="0 0 120 120"
          >
            {/* Background circle */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="8"
            />
            {/* Progress arc */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - progress}
              className="transition-all duration-1000 ease-out"
              style={{
                filter: `drop-shadow(0 0 6px ${color})`,
              }}
            />
          </svg>
          {/* Score number */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-3xl font-bold tabular-nums transition-colors duration-500"
              style={{ color }}
            >
              {score}
            </span>
            <span className="text-[10px] text-gray-500 uppercase">puan</span>
          </div>
        </div>

        {/* Price & Trend */}
        <div className="flex-1 min-w-0">
          <div className="text-2xl font-bold text-white tabular-nums">
            ${formatPrice(price)}
          </div>
          <div className="flex items-center gap-1.5 mt-1" style={{ color }}>
            <TrendIcon size={16} />
            <span className="text-sm font-medium">{label}</span>
          </div>
        </div>
      </div>

      {/* Reasoning Section */}
      <div className="border-t border-white/5 pt-4">
        <div className="flex items-center gap-1.5 mb-3">
          <HelpCircle size={14} className="text-gray-500" />
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Neden?
          </h4>
        </div>
        <ul className="space-y-1.5">
          {reasons.length > 0 ? (
            reasons.map((reason, i) => {
              const isPositive = reason.startsWith("✓");
              return (
                <li
                  key={i}
                  className="flex items-start gap-2 text-xs leading-relaxed transition-opacity duration-300"
                  style={{
                    color: isPositive
                      ? "rgba(255,255,255,0.8)"
                      : "rgba(255,255,255,0.4)",
                  }}
                >
                  <span
                    className="mt-0.5 w-1 h-1 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: isPositive ? "#00e676" : "#ef5350",
                    }}
                  />
                  {reason}
                </li>
              );
            })
          ) : (
            <li className="text-xs text-gray-600">Bağlantı bekleniyor...</li>
          )}
        </ul>
      </div>
    </div>
  );
}
