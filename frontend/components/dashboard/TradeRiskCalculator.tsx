"use client";

import React, { useState, useMemo } from "react";
import { useDashboardStore } from "@/lib/store";
import { formatPrice, getSignalLevel } from "@/lib/utils";
import { Calculator, Target, Shield, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

export default function TradeRiskCalculator() {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const candles = useDashboardStore((s) => s.candles);
  const signalData = useDashboardStore((s) => s.signalData);

  // Anlık fiyat
  const currentPrice = useMemo<number | null>(() => {
    if (signalData?.price) return signalData.price;
    if (candles && candles.length > 0) return candles[candles.length - 1].close;
    return null;
  }, [signalData, candles]);

  // Kullanıcı Girdileri
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [capital, setCapital] = useState<number>(1000); // 1000$
  const [riskPercent, setRiskPercent] = useState<number>(1.5); // %1.5 risk
  const [stopPercent, setStopPercent] = useState<number>(2.0); // %2.0 stop mesafesi

  // Sinyal bölgesi (backend ile aynı bantlar): AL >= 56, SAT <= 35, aradaki NÖTR.
  const signalZone: "long" | "short" | "neutral" = useMemo(() => {
    if (signalData?.score === undefined || signalData?.score === null) return "neutral";
    const level = getSignalLevel(signalData.score);
    if (level === "buy" || level === "strong_buy") return "long";
    if (level === "sell") return "short";
    return "neutral";
  }, [signalData?.score]);

  // Sadece bölge DEĞİŞİNCE yönü sinyale eşle. Nötr bölgede kullanıcının seçimi korunur,
  // ve her sinyal güncellemesinde manuel LONG/SHORT seçimi ezilmez.
  React.useEffect(() => {
    if (signalZone !== "neutral") setDirection(signalZone);
  }, [signalZone]);

  // Hesaplamalar (gerçek fiyat yoksa hesaplama yapılmaz)
  const calc = useMemo(() => {
    if (!currentPrice || currentPrice <= 0) return null;
    const isLong = direction === "long";
    const entry = currentPrice;

    // Stop Loss Fiyatı
    const slDist = entry * (stopPercent / 100);
    const slPrice = isLong ? entry - slDist : entry + slDist;

    // Hedefler (Risk:Ödül oranları)
    const tp1Dist = slDist * 1.5; // 1:1.5
    const tp2Dist = slDist * 2.5; // 1:2.5

    const tp1Price = isLong ? entry + tp1Dist : entry - tp1Dist;
    const tp2Price = isLong ? entry + tp2Dist : entry - tp2Dist;

    // Para Yönetimi (Position Sizing)
    const maxRiskUsd = capital * (riskPercent / 100);
    // Pozisyon Boyutu (USDT) = Maks Risk / Stop Yüzdesi
    const positionSizeUsd = maxRiskUsd / (stopPercent / 100);
    const positionQty = positionSizeUsd / entry;
    // Pozisyon sermayeyi aşıyorsa gereken kaldıraç
    const leverage = capital > 0 ? positionSizeUsd / capital : 0;

    const reward1Usd = maxRiskUsd * 1.5;
    const reward2Usd = maxRiskUsd * 2.5;

    return {
      entry,
      slPrice,
      tp1Price,
      tp2Price,
      maxRiskUsd,
      positionSizeUsd,
      positionQty,
      leverage,
      reward1Usd,
      reward2Usd,
    };
  }, [currentPrice, direction, capital, riskPercent, stopPercent]);

  if (!calc) {
    return (
      <div className="bg-gradient-to-br from-[var(--card-2)] to-[var(--card)] border border-[var(--line)] rounded-[18px] p-4 text-[11px] text-gray-500 select-none">
        Akıllı TP / SL Simülatörü — fiyat verisi bekleniyor...
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-[var(--card-2)] to-[var(--card)] border border-[var(--line)] rounded-[18px] p-4 flex flex-col gap-3 min-w-0 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Calculator size={13} />
          </div>
          <div>
            <h3 className="text-[12px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              Akıllı TP / SL Simülatörü
            </h3>
            <p className="text-[10px] text-gray-500">Risk-Ödül & Pozisyon Büyüklüğü</p>
          </div>
        </div>

        {/* Yön Seçici */}
        <div className="flex bg-black/30 rounded-lg p-0.5 border border-white/5">
          <button
            onClick={() => setDirection("long")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all ${
              direction === "long" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <TrendingUp size={11} />
            LONG
          </button>
          <button
            onClick={() => setDirection("short")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all ${
              direction === "short" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <TrendingDown size={11} />
            SHORT
          </button>
        </div>
      </div>

      {/* Girdi Parametreleri */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
          <span className="text-[9px] text-gray-500 uppercase block mb-1">Sermaye ($)</span>
          <input
            type="number"
            value={capital}
            onChange={(e) => setCapital(Math.max(10, parseFloat(e.target.value) || 0))}
            className="w-full bg-transparent font-mono text-xs font-bold text-white focus:outline-none"
          />
        </div>

        <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
          <span className="text-[9px] text-gray-500 uppercase block mb-1">Maks Risk (%)</span>
          <input
            type="number"
            step="0.5"
            value={riskPercent}
            onChange={(e) => setRiskPercent(Math.max(0.1, parseFloat(e.target.value) || 0))}
            className="w-full bg-transparent font-mono text-xs font-bold text-amber-400 focus:outline-none"
          />
        </div>

        <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
          <span className="text-[9px] text-gray-500 uppercase block mb-1">Stop Mesafesi (%)</span>
          <input
            type="number"
            step="0.5"
            value={stopPercent}
            onChange={(e) => setStopPercent(Math.max(0.5, parseFloat(e.target.value) || 0))}
            className="w-full bg-transparent font-mono text-xs font-bold text-rose-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Hesaplanan Pozisyon Özeti */}
      <div className="p-2.5 rounded-xl bg-indigo-500/[0.04] border border-indigo-500/15 flex items-center justify-between text-xs">
        <div>
          <span className="text-[10px] text-gray-400 block">Önerilen Pozisyon</span>
          <span className="font-mono font-bold text-white text-[13px]">
            ${calc.positionSizeUsd.toFixed(1)}
          </span>
          <span className="text-[9px] text-gray-500 font-mono ml-1">
            ({calc.positionQty.toLocaleString("en-US", { maximumSignificantDigits: 5 })} {activeSymbol.replace("USDT", "")})
          </span>
        </div>

        <div className="text-right">
          <span className="text-[10px] text-gray-400 block">Maks Kayıp Riski</span>
          <span className="font-mono font-bold text-rose-400 text-[13px]">
            -${calc.maxRiskUsd.toFixed(2)}
          </span>
        </div>
      </div>

      {calc.leverage > 1.01 && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[10px] text-amber-300 font-sans">
          <AlertTriangle size={11} className="shrink-0" />
          <span>
            Bu stop mesafesinde pozisyon sermayeyi aşıyor: yaklaşık <b>{calc.leverage.toFixed(1)}x</b> kaldıraç gerekir.
            Stop mesafesini genişletmek veya riski düşürmek kaldıraç ihtiyacını azaltır.
          </span>
        </div>
      )}

      {/* Fiyat Hedefleri (TP/SL) */}
      <div className="space-y-1 text-[11px] font-mono">
        {/* Entry */}
        <div className="flex justify-between items-center px-2 py-1 rounded bg-white/[0.02]">
          <span className="text-gray-400 font-sans text-[10px]">Giriş Fiyatı:</span>
          <span className="font-bold text-white">${formatPrice(calc.entry)}</span>
        </div>

        {/* Stop Loss */}
        <div className="flex justify-between items-center px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20">
          <span className="text-rose-400 font-sans font-semibold text-[10px] flex items-center gap-1">
            <Shield size={10} /> Stop-Loss (-%{stopPercent}):
          </span>
          <span className="font-bold text-rose-400">${formatPrice(calc.slPrice)}</span>
        </div>

        {/* TP 1 */}
        <div className="flex justify-between items-center px-2 py-1 rounded bg-emerald-500/[0.04]">
          <span className="text-emerald-400/80 font-sans text-[10px]">TP 1 (1:1.5 R:R):</span>
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-emerald-400">${formatPrice(calc.tp1Price)}</span>
            <span className="text-[9px] text-emerald-500 font-sans">(+${calc.reward1Usd.toFixed(1)})</span>
          </div>
        </div>

        {/* TP 2 (Ana Hedef) */}
        <div className="flex justify-between items-center px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/25">
          <span className="text-emerald-300 font-sans font-semibold text-[10px] flex items-center gap-1">
            <Target size={10} /> TP 2 (1:2.5 Altın Hedef):
          </span>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-emerald-300">${formatPrice(calc.tp2Price)}</span>
            <span className="text-[9px] text-emerald-400 font-sans font-bold">(+${calc.reward2Usd.toFixed(1)})</span>
          </div>
        </div>
      </div>
    </div>
  );
}
