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
      bg: "bg-emerald-950/40",
      border: "border-emerald-500/50",
      glow: "bg-emerald-500",
      icon: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
      badge: "bg-emerald-500 text-white",
      text: "text-emerald-300"
    },
    bearish: {
      bg: "bg-rose-950/40",
      border: "border-rose-500/50",
      glow: "bg-rose-500",
      icon: "text-rose-400 bg-rose-500/10 border-rose-500/20",
      badge: "bg-rose-500 text-white",
      text: "text-rose-300"
    },
    warning: {
      bg: "bg-orange-950/40",
      border: "border-orange-500/50",
      glow: "bg-orange-500",
      icon: "text-orange-400 bg-orange-500/10 border-orange-500/20",
      badge: "bg-orange-500 text-white",
      text: "text-orange-300"
    },
    neutral: {
      bg: "bg-slate-900/60",
      border: "border-slate-700",
      glow: "bg-blue-500",
      icon: "text-blue-400 bg-blue-500/10 border-blue-500/20",
      badge: "bg-slate-700 text-gray-300",
      text: "text-gray-300"
    }
  };

  const style = colorMap[advice.type];

  return (
    <div className={`
      relative overflow-hidden rounded-2xl border p-5 backdrop-blur-2xl shadow-2xl transition-all duration-500
      ${style.bg} ${style.border}
    `}>
      {/* Background glow animation */}
      <div className={`absolute -top-10 -right-10 w-48 h-48 rounded-full blur-[80px] opacity-20 pointer-events-none animate-pulse ${style.glow}`} />

      {/* Header */}
      <div className="flex justify-between items-center mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-inner ${style.icon}`}>
            <Bot size={22} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              AI Copilot <Sparkles size={14} className="text-yellow-400" />
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Güven Skoru:</span>
              <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${style.glow} transition-all duration-1000`} 
                  style={{ width: `${advice.confidence}%` }}
                />
              </div>
            </div>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-md text-xs font-black tracking-wider shadow-lg ${style.badge}`}>
          {advice.action === 'BUY' ? 'GİRİŞ YAP' : 
           advice.action === 'SELL' ? 'ÇIKIŞ YAP' : 'BEKLE'}
        </div>
      </div>
      
      {/* AI Advice Text */}
      <div className="relative z-10 bg-black/20 rounded-xl p-3 border border-white/5 mb-4">
        <p className="text-sm text-gray-200 font-medium leading-relaxed">
          {advice.text}
        </p>
      </div>

      {/* Actionable Trade Setup (Entries & Exits) */}
      {(advice.entry || advice.target || advice.stopLoss) && (
        <div className="grid grid-cols-3 gap-3 relative z-10">
          
          {advice.entry && (
            <div className="bg-slate-900/60 rounded-xl p-2.5 border border-slate-700 shadow-inner flex flex-col items-center justify-center group hover:bg-slate-800 transition-colors">
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">
                <Crosshair size={12} className="text-blue-400" /> Giriş
              </div>
              <div className="text-[13px] font-bold text-white group-hover:scale-105 transition-transform">
                {formatPrice(advice.entry)}
              </div>
            </div>
          )}

          {advice.target && (
            <div className="bg-emerald-950/30 rounded-xl p-2.5 border border-emerald-900/50 shadow-inner flex flex-col items-center justify-center group hover:bg-emerald-900/40 transition-colors">
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/80 font-bold uppercase tracking-wider mb-1">
                <Target size={12} className="text-emerald-400" /> Kar Al
              </div>
              <div className="text-[13px] font-bold text-emerald-400 group-hover:scale-105 transition-transform">
                {formatPrice(advice.target)}
              </div>
            </div>
          )}

          {advice.stopLoss && (
            <div className="bg-rose-950/30 rounded-xl p-2.5 border border-rose-900/50 shadow-inner flex flex-col items-center justify-center group hover:bg-rose-900/40 transition-colors">
              <div className="flex items-center gap-1.5 text-[10px] text-rose-400/80 font-bold uppercase tracking-wider mb-1">
                <ShieldAlert size={12} className="text-rose-400" /> Zarar Kes
              </div>
              <div className="text-[13px] font-bold text-rose-400 group-hover:scale-105 transition-transform">
                {formatPrice(advice.stopLoss)}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
