"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  Coins
} from "lucide-react";
import OrderBook from "@/components/dashboard/OrderBook";
import RecentTrades from "@/components/dashboard/RecentTrades";
import CrossExchangeRadar from "@/components/dashboard/CrossExchangeRadar";

interface MexcTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
}

const DEFAULT_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "MXUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "SUIUSDT",
  "NEARUSDT",
  "PEPEUSDT",
  "ENAUSDT"
];

export default function MexcPage() {
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [tickers, setTickers] = useState<MexcTicker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchTickers = async () => {
    try {
      const res = await fetch("/api/mexc?endpoint=ticker");
      if (res.ok) {
        const data: MexcTicker[] = await res.json();
        if (Array.isArray(data)) {
          const filtered = DEFAULT_SYMBOLS.map((sym) => {
            const found = data.find((d) => d.symbol === sym);
            return (
              found || {
                symbol: sym,
                lastPrice: "0",
                priceChangePercent: "0",
                quoteVolume: "0",
                highPrice: "0",
                lowPrice: "0",
              }
            );
          });
          setTickers(filtered);
          setLastUpdated(new Date());
        }
      }
    } catch (err) {
      console.error("MEXC tickers error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTickers();
    const interval = setInterval(fetchTickers, 4000);
    return () => clearInterval(interval);
  }, []);

  const activeTicker = tickers.find((t) => t.symbol === selectedSymbol);
  const activeChange = parseFloat(activeTicker?.priceChangePercent || "0") * 100;
  const isPositive = activeChange >= 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#08090b] text-white">
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-3 border-b border-white/5 bg-[#08090b]/90 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center font-bold text-xs tracking-wider">
              MX
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold">MEXC Canlı Terminal</h1>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                  Global API
                </span>
              </div>
              <p className="text-[10px] text-gray-500">Doğrudan MEXC Likiditesi & Emir Defteri</p>
            </div>
          </div>
        </div>

        {/* Orta Navigasyon Linkleri */}
        <div className="hidden md:flex items-center gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/5 text-xs">
          <Link
            href="/"
            className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Binance Terminal
          </Link>
          <Link
            href="/screener"
            className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Token Tarayıcı
          </Link>
          <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-semibold">
            MEXC Terminal
          </span>
        </div>

        {/* Sağ Bilgi / Yenile */}
        <div className="flex items-center gap-3">
          {isLoading && <Loader2 size={14} className="text-gray-500 animate-spin" />}
          {lastUpdated && (
            <span className="text-[10px] text-gray-600 font-mono hidden md:block">
              {lastUpdated.toLocaleTimeString("tr-TR")}
            </span>
          )}
          <button
            onClick={fetchTickers}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-gray-300 transition-colors"
          >
            <RefreshCw size={12} />
            Yenile
          </button>
        </div>
      </header>

      {/* ── PARİTE ŞERİDİ (TICKER BAR) ── */}
      <div className="px-6 py-2 border-b border-white/5 bg-white/[0.015] overflow-x-auto scrollbar-hide flex items-center gap-2">
        {tickers.map((t) => {
          const change = parseFloat(t.priceChangePercent || "0") * 100;
          const pos = change >= 0;
          const isSelected = t.symbol === selectedSymbol;

          return (
            <button
              key={t.symbol}
              onClick={() => setSelectedSymbol(t.symbol)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs shrink-0 transition-all cursor-pointer border ${
                isSelected
                  ? "bg-emerald-500/15 border-emerald-500/30 text-white shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                  : "bg-white/[0.03] border-white/5 text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="font-bold">{t.symbol.replace("USDT", "")}</span>
              <span className="font-mono text-white text-[11px]">
                ${parseFloat(t.lastPrice || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </span>
              <span className={`text-[10px] font-semibold ${pos ? "text-emerald-400" : "text-rose-400"}`}>
                {pos ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>

      {/* ── ANA İÇERİK IZGARASI ── */}
      <main className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-4 gap-4 overflow-hidden">
        {/* SOL: GRAFİK VE DETAYLAR (3 SÜTUN) */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* Seçili Parite Başlık Kartı */}
          <div className="flex flex-wrap items-center justify-between p-4 bg-[#0d0e12]/80 border border-white/5 rounded-2xl backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center font-bold text-white text-sm">
                {selectedSymbol.replace("USDT", "")}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">{selectedSymbol}</h2>
                  <span className="text-xs text-gray-500">MEXC Spot</span>
                </div>
                <div className="text-xs text-gray-400 font-mono">
                  24s Hacim: ${(parseFloat(activeTicker?.quoteVolume || "0") / 1e6).toFixed(2)}M
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">Son Fiyat</div>
                <div className="text-xl font-bold font-mono">
                  ${parseFloat(activeTicker?.lastPrice || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">24s Değişim</div>
                <div className={`text-base font-bold flex items-center gap-1 font-mono ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                  {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {isPositive ? "+" : ""}
                  {activeChange.toFixed(2)}%
                </div>
              </div>

              <div className="hidden sm:block">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider">24s En Yüksek / En Düşük</div>
                <div className="text-xs font-mono text-gray-300">
                  ${parseFloat(activeTicker?.highPrice || "0").toFixed(2)} / ${parseFloat(activeTicker?.lowPrice || "0").toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Canlı Grafik Alanı (TradingView Iframe - MEXC Spot Feed) */}
          <div className="flex-1 min-h-[480px] bg-[#0d0e12]/80 border border-white/5 rounded-2xl overflow-hidden p-1 relative">
            <iframe
              key={selectedSymbol}
              src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_mexc&symbol=MEXC%3A${selectedSymbol}&interval=15&hidesidetoolbar=1&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark&style=1&timezone=Europe%2FIstanbul&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=tr`}
              className="w-full h-full border-0 rounded-xl"
              title="MEXC TradingView"
            />
          </div>
        </div>

        {/* SAĞ: EMİR DEFTERİ VE SON İŞLEMLER (1 SÜTUN) */}
        <div className="lg:col-span-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
          <div className="h-[320px]">
            <OrderBook symbol={selectedSymbol} exchange="mexc" />
          </div>
          <div className="min-h-[240px]">
            <RecentTrades symbol={selectedSymbol} exchange="mexc" />
          </div>
          <CrossExchangeRadar />
        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer className="px-6 py-2.5 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-600">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Coins size={10} /> MEXC REST API v3
          </span>
          <span className="text-gray-500">Spot Market · Derinlik: 20 kademe</span>
        </div>
        <span>{tickers.length} parite izleniyor</span>
      </footer>
    </div>
  );
}
