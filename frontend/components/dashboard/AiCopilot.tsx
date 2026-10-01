"use client";

import { useEffect, useState } from "react";
import { Bot, Sparkles, Target, ShieldAlert, Crosshair } from "lucide-react";
import { useDashboardStore } from "@/lib/store";

const formatPrice = (p: number) => {
  if (p < 0.001) return "$" + p.toFixed(6);
  if (p < 1) return "$" + p.toFixed(4);
  if (p < 10) return "$" + p.toFixed(3);
  return "$" + p.toFixed(2);
};

export default function AiCopilot() {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const signalData = useDashboardStore((s) => s.signalData);
  const candles = useDashboardStore((s) => s.candles);

  const [advice, setAdvice] = useState<{
    text: string;
    action: "BUY" | "SELL" | "WAIT";
    type: "bullish" | "bearish" | "neutral" | "warning";
    entry?: number;
    target?: number;
    stopLoss?: number;
    confidence: number;
  } | null>(null);

  useEffect(() => {
    // Generate AI advice based on real-time signal and candle data
    if (!signalData || candles.length === 0) {
      setAdvice({
        text: `${activeSymbol.replace("USDT", "")} için piyasa verileri analiz ediliyor... Lütfen bekleyin.`,
        action: "WAIT",
        type: "neutral",
        confidence: 0
      });
      return;
    }

    const sig = signalData;
    const price = sig.price;
    const ind = sig.indicators;
    const rsi = ind.rsi ?? 50;
    const score = sig.score;
    
    // Dynamic Support / Resistance mapping
    const vwap = ind.vwap;
    const bbUpper = ind.bb_upper;
    const bbLower = ind.bb_lower;
    const ema200 = ind.ema_200;
    
    let entry: number | undefined;
    let target: number | undefined;
    let stopLoss: number | undefined;
    let text = "";
    let action: "BUY" | "SELL" | "WAIT" = "WAIT";
    let type: "bullish" | "bearish" | "neutral" | "warning" = "neutral";
    let confidence = 50;

    // Last candle volume check
    const lastCandle = candles[candles.length - 1];
    const lastVolume = lastCandle.volume;
    const avgVolume = candles.slice(Math.max(0, candles.length - 11), candles.length - 1)
      .reduce((sum, c) => sum + c.volume, 0) / 10 || 1;
    const volSpike = lastVolume > avgVolume * 1.5;

    // AI Logic Engine
    if (score >= 65) {
      action = "BUY";
      type = "bullish";
      confidence = score;
      // Ideal entry is on a slight pullback to VWAP, or market if already above
      entry = (vwap && price > vwap) ? vwap : price;
      // Target upper band or fixed 3%
      target = (bbUpper && bbUpper > price) ? bbUpper : price * 1.03;
      // Stop loss below lower band or 200 EMA
      stopLoss = ema200 ? Math.min(ema200, bbLower || price * 0.97) : price * 0.97;
      
      if (volSpike) {
        text = `Hacim patlamasıyla birlikte güçlü AL sinyali. Hedef noktasına doğru ivmelenme başladı. Kademeli giriş için ideal setup!`;
      } else {
        text = `Trend pozitif yönde. ${formatPrice(entry)} seviyesinden (VWAP/Destek) giriş yapılabilir. Stop-loss kurmayı unutmayın.`;
      }
    } else if (score <= 35) {
      action = "SELL";
      type = "bearish";
      confidence = 100 - score;
      entry = price; // Selling at market
      target = bbLower ? bbLower : price * 0.95;
      stopLoss = (vwap && vwap > price) ? vwap : price * 1.03;
      
      if (volSpike) {
        text = `Büyük bir satış dalgası var (Hacimli Düşüş). Bıçak düşerken tutulmaz. Zararı kesip nakite geçmek için son fırsatlar.`;
      } else {
        text = `Satış baskısı hakim ve teknik göstergeler zayıf. Yeni alım yapmak için çok erken, hedeflere kadar düşüş sürebilir.`;
      }
    } else if (rsi >= 75) {
      action = "SELL";
      type = "warning";
      confidence = 80;
      entry = price;
      target = vwap || price * 0.96;
      stopLoss = price * 1.02;
      text = `⚠️ Fiyat aşırı şişti (RSI > 75). Kâr satışı gelme olasılığı çok yüksek. Yeni alım tehlikeli, elinizdekileri satmayı düşünün.`;
    } else if (rsi <= 25) {
      action = "BUY";
      type = "bullish";
      confidence = 75;
      entry = price;
      target = vwap || price * 1.04;
      stopLoss = bbLower ? bbLower * 0.99 : price * 0.96;
      text = `Aşırı satım bölgesinde (RSI dipte). Tepki alımı gelmesi bekleniyor. Risk/ödül oranı açısından cazip bir GİRİŞ fırsatı.`;
    } else {
      action = "WAIT";
      type = "neutral";
      confidence = 50;
      // Provide potential breakout/breakdown levels even in neutral state
      entry = vwap || price;
      target = bbUpper || price * 1.02;
      stopLoss = bbLower || price * 0.98;
      text = `Piyasa şu an yatay ve hacim düşük. Kırılım yönü belli değil. Alt banttan (${formatPrice(stopLoss)}) sekme veya VWAP (${formatPrice(entry)}) kırılımı beklenebilir.`;
    }

    setAdvice({ text, action, type, entry, target, stopLoss, confidence });

  }, [activeSymbol, signalData, candles]);

  if (!advice) return null;

  // Determine colors based on type
  const colorMap = {
    bullish: {
      bg: "bg-emerald-950/20",
      border: "border-emerald-500/30",
      glow: "bg-emerald-500",
      icon: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
      badge: "bg-gradient-to-r from-emerald-600 to-emerald-400 text-white shadow-emerald-500/20",
      accent: "#10b981"
    },
    bearish: {
      bg: "bg-rose-950/20",
      border: "border-rose-500/30",
      glow: "bg-rose-500",
      icon: "text-rose-300 bg-rose-500/10 border-rose-500/30",
      badge: "bg-gradient-to-r from-rose-600 to-rose-400 text-white shadow-rose-500/20",
      accent: "#f43f5e"
    },
    warning: {
      bg: "bg-amber-950/20",
      border: "border-amber-500/30",
      glow: "bg-amber-500",
      icon: "text-amber-300 bg-amber-500/10 border-amber-500/30",
      badge: "bg-gradient-to-r from-amber-600 to-amber-400 text-white shadow-amber-500/20",
      accent: "#f59e0b"
    },
    neutral: {
      bg: "bg-slate-900/40",
      border: "border-indigo-500/20",
      glow: "bg-indigo-500",
      icon: "text-indigo-300 bg-indigo-500/10 border-indigo-500/30",
      badge: "bg-gradient-to-r from-slate-700 to-slate-600 text-gray-200 shadow-slate-900/50",
      accent: "#6366f1"
    }
  };

  const style = colorMap[advice.type];

  return (
    <div className={`
      relative overflow-hidden rounded-2xl border p-5 backdrop-blur-3xl shadow-2xl transition-all duration-700 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)]
      ${style.bg} ${style.border} group/copilot
    `}>
      {/* Premium Animated Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)] pointer-events-none" />

      {/* Dynamic Radar/Glow Animation */}
      <div className={`absolute -top-24 -right-24 w-64 h-64 rounded-full blur-[100px] opacity-20 pointer-events-none animate-pulse ${style.glow}`} />
      <div className={`absolute -bottom-10 -left-10 w-40 h-40 rounded-full blur-[80px] opacity-10 pointer-events-none ${style.glow}`} />

      {/* Header */}
      <div className="flex justify-between items-start mb-5 relative z-10">
        <div className="flex items-center gap-3.5">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center border shadow-inner relative overflow-hidden ${style.icon}`}>
            {/* Subtle inner scan effect */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/10 to-transparent -translate-y-full opacity-0 group-hover/copilot:opacity-100 transition-opacity duration-1000" />
            <Bot size={24} className="relative z-10" />
          </div>
          <div>
            <h4 className="text-[15px] font-extrabold text-white flex items-center gap-1.5 tracking-tight">
              AI COPILOT <Sparkles size={14} className="text-yellow-400 animate-pulse" />
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[9px] text-gray-400 uppercase tracking-[0.2em] font-bold">Güven Skoru:</span>
              <div className="w-20 h-1.5 bg-black/40 rounded-full overflow-hidden shadow-inner border border-white/5">
                <div 
                  className={`h-full rounded-full ${style.glow} transition-all duration-1000 ease-out`} 
                  style={{ width: `${advice.confidence}%`, boxShadow: `0 0 10px ${style.accent}` }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className={`px-4 py-1.5 rounded-lg text-xs font-black tracking-widest shadow-lg uppercase border border-white/10 ${style.badge}`}>
          {advice.action === 'BUY' ? 'GİRİŞ YAP' : 
           advice.action === 'SELL' ? 'ÇIKIŞ YAP' : 'PİYASAYI İZLE'}
        </div>
      </div>
      
      {/* AI Advice Text */}
      <div className="relative z-10 bg-black/40 rounded-xl p-4 border border-white/10 mb-5 shadow-inner overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full opacity-80 shadow-[0_0_10px_currentColor]" style={{ backgroundColor: style.accent, color: style.accent }} />
        <p className="text-[13px] text-gray-300 font-medium leading-relaxed pl-2 tracking-wide">
          {advice.text}
        </p>
      </div>

      {/* Actionable Trade Setup (Entries & Exits) */}
      {(advice.entry || advice.target || advice.stopLoss) && (
        <div className="grid grid-cols-3 gap-3 relative z-10">
          
          {advice.entry && (
            <div className="bg-slate-950/60 rounded-xl p-3.5 border border-white/5 shadow-lg flex flex-col items-center justify-center group hover:bg-slate-900 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/30">
              <div className="flex items-center gap-1.5 text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1.5">
                <Crosshair size={12} className="text-blue-400 opacity-80" /> GİRİŞ
              </div>
              <div className="text-[15px] font-black text-white font-mono tracking-tight group-hover:text-blue-400 transition-colors drop-shadow-md">
                {formatPrice(advice.entry)}
              </div>
            </div>
          )}

          {advice.target && (
            <div className="bg-slate-950/60 rounded-xl p-3.5 border border-white/5 shadow-lg flex flex-col items-center justify-center group hover:bg-slate-900 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/30">
              <div className="flex items-center gap-1.5 text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1.5">
                <Target size={12} className="text-emerald-400 opacity-80" /> HEDEF
              </div>
              <div className="text-[15px] font-black text-white font-mono tracking-tight group-hover:text-emerald-400 transition-colors drop-shadow-md">
                {formatPrice(advice.target)}
              </div>
            </div>
          )}

          {advice.stopLoss && (
            <div className="bg-slate-950/60 rounded-xl p-3.5 border border-white/5 shadow-lg flex flex-col items-center justify-center group hover:bg-slate-900 transition-all duration-300 hover:-translate-y-1 hover:border-rose-500/30">
              <div className="flex items-center gap-1.5 text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1.5">
                <ShieldAlert size={12} className="text-rose-400 opacity-80" /> STOP
              </div>
              <div className="text-[15px] font-black text-white font-mono tracking-tight group-hover:text-rose-400 transition-colors drop-shadow-md">
                {formatPrice(advice.stopLoss)}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
