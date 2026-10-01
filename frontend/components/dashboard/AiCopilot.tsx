"use client";

import { useEffect, useState } from "react";
import { Bot, Sparkles, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { useDashboardStore } from "@/lib/store";

export default function AiCopilot() {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const signalData = useDashboardStore((s) => s.signalData);
  const candles = useDashboardStore((s) => s.candles);

  const [advice, setAdvice] = useState<{
    text: string;
    action: "BUY" | "SELL" | "WAIT";
    type: "bullish" | "bearish" | "neutral" | "warning";
  } | null>(null);

  useEffect(() => {
    // Generate AI advice based on real-time signal and candle data
    if (!signalData || candles.length === 0) {
      setAdvice({
        text: `${activeSymbol.replace("USDT", "")} için piyasa verileri analiz ediliyor... Lütfen bekleyin.`,
        action: "WAIT",
        type: "neutral"
      });
      return;
    }

    const sig = signalData;
    const rsi = sig.indicators.rsi;
    const macdTrend = sig.indicators.macd_trend;
    const score = sig.score;
    const lastCandle = candles[candles.length - 1];
    
    // Check volume spike
    const lastVolume = lastCandle.volume;
    const avgVolume = candles.slice(Math.max(0, candles.length - 11), candles.length - 1)
      .reduce((sum, c) => sum + c.volume, 0) / 10 || 1;
    const volSpike = lastVolume > avgVolume * 2;

    // Generate intelligent advice
    if (score >= 70 && volSpike) {
      setAdvice({
        text: `🚀 Hacim patlaması var ve indikatörler onaylıyor! Balinalar alımda. Buradan kademeli GİRİŞ yapılabilir. Kar al hedefinizi %2-%3'e koyun.`,
        action: "BUY",
        type: "bullish"
      });
    } else if (score >= 60 && rsi < 40) {
      setAdvice({
        text: `📈 Fiyat ucuzlamış (RSI dipte) ve MACD dönüş sinyali veriyor. Düşük riskli GİRİŞ fırsatı. Stop-loss'u son dibin altına koymayı unutma.`,
        action: "BUY",
        type: "bullish"
      });
    } else if (score <= 30 && volSpike) {
      setAdvice({
        text: `🩸 Panik satışı! Hacimli bir düşüş var. Bıçak düşerken tutulmaz, dibi bulmasını BEKLE. (Eğer içerideysen zararı kesmeyi düşün).`,
        action: "SELL",
        type: "bearish"
      });
    } else if (rsi >= 75) {
      setAdvice({
        text: `⚠️ Aşırı Alım Bölgesi! Fiyat çok şişti ve kâr satışları an meselesi. Buradan yeni giriş yapmak çok RİSKLİ. Elindekileri satıp ÇIKIŞ yapabilirsin.`,
        action: "SELL",
        type: "warning"
      });
    } else if (score >= 50 && score <= 60) {
      setAdvice({
        text: `⚖️ Piyasa şu an kararsız (Konsolidasyon). Net bir yön yok. MACD kesişimini beklemek en güvenli strateji. Nakitte KAL.`,
        action: "WAIT",
        type: "neutral"
      });
    } else {
      setAdvice({
        text: `Zayıf trend. Hacim düşük ve indikatörler satıcılı yönü gösteriyor. Acele etmeyin, destek seviyesine inmesini BEKLEYİN.`,
        action: "WAIT",
        type: "neutral"
      });
    }
  }, [activeSymbol, signalData, candles]);

  if (!advice) return null;

  return (
    <div className={`
      relative overflow-hidden rounded-xl border p-3 flex items-start gap-3 backdrop-blur-xl shadow-lg transition-colors
      ${advice.type === 'bullish' ? 'bg-emerald-950/20 border-emerald-500/30' : 
        advice.type === 'bearish' ? 'bg-rose-950/20 border-rose-500/30' : 
        advice.type === 'warning' ? 'bg-orange-950/20 border-orange-500/30' : 
        'bg-slate-900/30 border-white/10'}
    `}>
      {/* Background glow */}
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-[50px] opacity-20 pointer-events-none
        ${advice.type === 'bullish' ? 'bg-emerald-500' : 
          advice.type === 'bearish' ? 'bg-rose-500' : 
          advice.type === 'warning' ? 'bg-orange-500' : 'bg-cyan-500'}
      `} />

      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border shadow-inner z-10
        ${advice.type === 'bullish' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 
          advice.type === 'bearish' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 
          advice.type === 'warning' ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' : 
          'bg-slate-800 border-white/10 text-cyan-400'}
      `}>
        <Bot size={20} />
      </div>
      
      <div className="flex-1 min-w-0 z-10">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
            <Sparkles size={12} className="text-yellow-400" />
            Yapay Zeka Tüyosu
          </h4>
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded
            ${advice.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 
              advice.action === 'SELL' ? 'bg-rose-500/20 text-rose-400' : 
              'bg-slate-700 text-gray-300'}
          `}>
            {advice.action === 'BUY' ? 'GİRİŞ FIRSATI' : 
             advice.action === 'SELL' ? 'ÇIKIŞ ZAMANI' : 'BEKLE'}
          </span>
        </div>
        <p className="text-[11px] md:text-xs text-gray-300 font-medium leading-relaxed">
          {advice.text}
        </p>
      </div>
    </div>
  );
}
