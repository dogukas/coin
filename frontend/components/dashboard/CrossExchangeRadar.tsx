"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ArrowLeftRight, RefreshCw, Zap, Info } from "lucide-react";
import { formatPrice } from "@/lib/utils";

const TRACKED_PAIRS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "SUIUSDT",
  "NEARUSDT",
  "PEPEUSDT",
];

// Ölçüm gürültüsünün üstü: iki borsa fiyatı birer anlık görüntü olduğu için
// majörlerdeki ~%0.01–0.05'lik fark normaldir. Bayrak için hem büyük hem kalıcı fark gerekir.
const FLAG_SPREAD_PCT = 0.15;
const FLAG_MIN_STREAK = 3; // aynı yönde art arda ölçüm sayısı
const POLL_MS = 5000;

// Binance spot fiyatı: önce data-api (CORS açık, hafif), olmazsa api.binance.com
const BINANCE_ENDPOINTS = [
  "https://data-api.binance.vision/api/v3/ticker/price",
  "https://api.binance.com/api/v3/ticker/price",
];

interface MexcPriceRow {
  symbol: string;
  price: string;
}

interface RadarRow {
  symbol: string;
  binancePrice: number | null;
  mexcPrice: number | null;
  spreadPct: number | null;
  premium: "mexc" | "binance" | null; // hangi borsa daha pahalı
  flagged: boolean;
}

export default function CrossExchangeRadar() {
  const [mexcData, setMexcData] = useState<Record<string, number>>({});
  const [binanceData, setBinanceData] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [streaks, setStreaks] = useState<Record<string, { sign: number; count: number }>>({});
  const mountedRef = useRef(true);

  const fetchBinancePrices = useCallback(async (): Promise<Record<string, number> | null> => {
    const symbolsParam = encodeURIComponent(JSON.stringify(TRACKED_PAIRS));
    for (const base of BINANCE_ENDPOINTS) {
      try {
        const res = await fetch(`${base}?symbols=${symbolsParam}`);
        if (!res.ok) continue;
        const raw: MexcPriceRow[] = await res.json();
        const map: Record<string, number> = {};
        for (const item of raw) {
          const p = parseFloat(item.price);
          if (Number.isFinite(p) && p > 0) map[item.symbol] = p;
        }
        if (Object.keys(map).length > 0) return map;
      } catch {
        // sıradaki endpoint'i dene
      }
    }
    return null;
  }, []);

  const fetchMexcPrices = useCallback(async (): Promise<Record<string, number> | null> => {
    try {
      const res = await fetch("/api/mexc?endpoint=price");
      if (!res.ok) return null;
      const raw: MexcPriceRow[] = await res.json();
      if (!Array.isArray(raw)) return null;
      const map: Record<string, number> = {};
      for (const item of raw) {
        if (!TRACKED_PAIRS.includes(item.symbol)) continue;
        const p = parseFloat(item.price);
        if (Number.isFinite(p) && p > 0) map[item.symbol] = p;
      }
      return Object.keys(map).length > 0 ? map : null;
    } catch {
      return null;
    }
  }, []);

  const refreshAll = useCallback(async () => {
    // İki borsa paralel çekilir; biri düşerse diğerinin son değeri korunur.
    const [b, m] = await Promise.all([fetchBinancePrices(), fetchMexcPrices()]);
    if (!mountedRef.current) return;

    if (b) setBinanceData(b);
    if (m) setMexcData(m);

    // Her iki taraf da taze ise seri (streak) güncelle
    if (b && m) {
      setStreaks((prev) => {
        const next: Record<string, { sign: number; count: number }> = {};
        for (const sym of TRACKED_PAIRS) {
          const bp = b[sym];
          const mp = m[sym];
          if (!bp || !mp) {
            next[sym] = { sign: 0, count: 0 };
            continue;
          }
          const spread = ((mp - bp) / bp) * 100;
          const sign = Math.abs(spread) >= FLAG_SPREAD_PCT ? Math.sign(spread) : 0;
          const old = prev[sym];
          next[sym] =
            sign !== 0 && old && old.sign === sign
              ? { sign, count: old.count + 1 }
              : { sign, count: sign !== 0 ? 1 : 0 };
        }
        return next;
      });
      setLastUpdated(new Date());
    }
    setIsLoading(false);
  }, [fetchBinancePrices, fetchMexcPrices]);

  useEffect(() => {
    mountedRef.current = true;
    refreshAll();
    const interval = setInterval(refreshAll, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refreshAll]);

  const rows: RadarRow[] = useMemo(() => {
    return TRACKED_PAIRS.map((sym) => {
      const bp = binanceData[sym] ?? null;
      const mp = mexcData[sym] ?? null;
      let spread: number | null = null;
      let premium: "mexc" | "binance" | null = null;
      if (bp && mp) {
        spread = ((mp - bp) / bp) * 100;
        if (spread > 0) premium = "mexc";
        else if (spread < 0) premium = "binance";
      }
      const streak = streaks[sym];
      const flagged = !!streak && streak.count >= FLAG_MIN_STREAK && spread !== null && Math.abs(spread) >= FLAG_SPREAD_PCT;
      return { symbol: sym, binancePrice: bp, mexcPrice: mp, spreadPct: spread, premium, flagged };
    });
  }, [binanceData, mexcData, streaks]);

  return (
    <div className="bg-gradient-to-br from-[var(--card-2)] to-[var(--card)] border border-[var(--line)] rounded-[18px] p-4 flex flex-col gap-3 min-w-0 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <ArrowLeftRight size={13} />
          </div>
          <div>
            <h3 className="text-[12px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              Çapraz Borsa Radarı
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-normal">
                Binance ⟷ MEXC
              </span>
            </h3>
            <p className="text-[10px] text-gray-500">Anlık fiyat farkı (spread)</p>
          </div>
        </div>

        <button
          onClick={refreshAll}
          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          title="Yenile"
        >
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Satırlar */}
      <div className="space-y-1.5 overflow-hidden">
        {rows.map((item) => {
          const hasSpread = item.spreadPct !== null && Math.abs(item.spreadPct) >= FLAG_SPREAD_PCT;

          return (
            <div
              key={item.symbol}
              className={`p-2.5 rounded-xl border transition-all text-xs flex items-center justify-between ${
                item.flagged
                  ? "bg-amber-500/[0.05] border-amber-500/25"
                  : hasSpread
                  ? "bg-white/[0.03] border-white/10"
                  : "bg-white/[0.02] border-white/5"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-[12px]">{item.symbol.replace("USDT", "")}</span>
                {item.flagged && item.premium && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold flex items-center gap-1">
                    <Zap size={9} />
                    {item.premium === "mexc" ? "MEXC primli" : "Binance primli"}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 text-[11px] font-mono">
                <div className="text-right">
                  <div className="text-[9px] text-gray-500 uppercase">Binance</div>
                  <div className="text-gray-300 font-semibold">
                    {item.binancePrice !== null ? `$${formatPrice(item.binancePrice)}` : "—"}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[9px] text-gray-500 uppercase">MEXC</div>
                  <div className="text-gray-300 font-semibold">
                    {item.mexcPrice !== null ? `$${formatPrice(item.mexcPrice)}` : "—"}
                  </div>
                </div>

                <div className="min-w-[64px] text-right">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      item.spreadPct === null
                        ? "text-gray-600 bg-white/5"
                        : item.flagged
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "text-gray-400 bg-white/5"
                    }`}
                  >
                    {item.spreadPct === null
                      ? "—"
                      : `${item.spreadPct > 0 ? "+" : ""}${item.spreadPct.toFixed(2)}%`}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dürüst dipnot: yorum sınırı */}
      <div className="flex items-start gap-1.5 text-[9px] leading-snug text-gray-600 font-sans">
        <Info size={10} className="shrink-0 mt-px" />
        <span>
          Fark; ≥%{FLAG_SPREAD_PCT} ve art arda {FLAG_MIN_STREAK} ölçümde aynı yönde ise işaretlenir. Fiyatlar iki ayrı
          anlık görüntüdür; işlem ücreti ve transfer süresi dahil değildir, tek başına arbitraj/öncü sinyal değildir.
          {lastUpdated ? ` Son: ${lastUpdated.toLocaleTimeString("tr-TR")}` : ""}
        </span>
      </div>
    </div>
  );
}
