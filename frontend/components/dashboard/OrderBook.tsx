"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Loader2, Layers, ShieldAlert, ShieldCheck, TrendingUp, TrendingDown, Scale } from "lucide-react";
import { analyzeOrderBookImpact } from "@/lib/orderBookImpact";
import { formatVolume } from "@/lib/utils";

interface OrderBookProps {
  symbol: string;
  exchange?: "binance" | "mexc";
}

type OrderLevel = [string, string]; // [price, amount]

interface WhaleWall {
  price: number;
  qty: number;
  valueUsd: number;
  type: "bid" | "ask";
}

export default function OrderBook({ symbol, exchange = "binance" }: OrderBookProps) {
  const [bids, setBids] = useState<OrderLevel[]>([]);
  const [asks, setAsks] = useState<OrderLevel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setBids([]);
    setAsks([]);
    setIsLoading(true);

    let ws: WebSocket | null = null;
    let pollInterval: NodeJS.Timeout | null = null;
    let stopWs: (() => void) | null = null;

    if (exchange === "mexc") {
      const fetchDepth = async () => {
        try {
          const res = await fetch(`/api/mexc?endpoint=depth&symbol=${symbol}&limit=20`);
          if (res.ok) {
            const data = await res.json();
            if (data.bids && data.asks) {
              setBids(data.bids.slice(0, 20));
              setAsks(data.asks.slice(0, 20).reverse());
              setIsLoading(false);
            }
          }
        } catch (err) {
          console.error("MEXC depth error:", err);
        }
      };

      fetchDepth();
      pollInterval = setInterval(fetchDepth, 2000);
    } else {
      // Binance partial book depth stream. Payload shape: { lastUpdateId, bids, asks }
      // (the short b/a keys belong to the diff stream, not @depth20).
      // Endpoint fallback mirrors DepthChart: binance-vision first, then binance.com.
      const hosts = [
        "wss://data-stream.binance.vision:9443/ws",
        "wss://stream.binance.com:9443/ws",
      ];
      const cleanSym = symbol.toLowerCase();
      let hostIndex = 0;
      let disposed = false;
      let gotData = false;
      let retryTimer: NodeJS.Timeout | null = null;

      const connect = () => {
        if (disposed) return;
        gotData = false;
        const socket = new WebSocket(`${hosts[hostIndex]}/${cleanSym}@depth20@100ms`);
        ws = socket;

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (Array.isArray(data.bids) && Array.isArray(data.asks) && data.bids.length > 0) {
              gotData = true;
              setBids(data.bids.slice(0, 20));
              setAsks(data.asks.slice(0, 20).reverse());
              setIsLoading(false);
            }
          } catch {
            // ignore malformed frame
          }
        };

        const failOver = () => {
          if (disposed) return;
          socket.onclose = null;
          socket.onerror = null;
          // Switch host only if this one never delivered data; otherwise just reconnect.
          if (!gotData) hostIndex = (hostIndex + 1) % hosts.length;
          retryTimer = setTimeout(connect, gotData ? 1000 : 1500);
        };
        socket.onerror = failOver;
        socket.onclose = failOver;
      };

      connect();
      stopWs = () => {
        disposed = true;
        if (retryTimer) clearTimeout(retryTimer);
      };
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (stopWs) stopWs();
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    };
  }, [symbol, exchange]);

  // Derinlik hesaplamaları (maksimum hacme göre bar genişliği)
  const maxVolume = useMemo(() => {
    let max = 0;
    for (const b of bids) max = Math.max(max, parseFloat(b[1]) || 0);
    for (const a of asks) max = Math.max(max, parseFloat(a[1]) || 0);
    return max || 1;
  }, [bids, asks]);

  // Alıcı / Satıcı Hacim Oranı
  const buyRatio = useMemo(() => {
    const totalBids = bids.reduce((acc, b) => acc + (parseFloat(b[1]) || 0), 0);
    const totalAsks = asks.reduce((acc, a) => acc + (parseFloat(a[1]) || 0), 0);
    const sum = totalBids + totalAsks;
    if (sum === 0) return 50;
    return Math.round((totalBids / sum) * 100);
  }, [bids, asks]);

  // 🐋 Balina Duvarı Tespiti
  const { topBidWall, topAskWall, avgLevelUsd } = useMemo(() => {
    let totalUsd = 0;
    let count = 0;

    const bidWalls: WhaleWall[] = [];
    const askWalls: WhaleWall[] = [];

    for (const [p, q] of bids) {
      const val = parseFloat(p) * parseFloat(q);
      totalUsd += val;
      count++;
      bidWalls.push({ price: parseFloat(p), qty: parseFloat(q), valueUsd: val, type: "bid" });
    }

    for (const [p, q] of asks) {
      const val = parseFloat(p) * parseFloat(q);
      totalUsd += val;
      count++;
      askWalls.push({ price: parseFloat(p), qty: parseFloat(q), valueUsd: val, type: "ask" });
    }

    const avg = count > 0 ? totalUsd / count : 10000;
    // Duvar eşiği: medyan kademenin 4 katı (tek dev duvar ortalamayı şişirir, medyan şişmez)
    // ve en az 10.000$ — küçük/ince defterlerde gürültüyü eler.
    const levelValues = [...bidWalls, ...askWalls].map((w) => w.valueUsd).sort((a, b) => a - b);
    const median = levelValues.length > 0 ? levelValues[Math.floor(levelValues.length / 2)] : 0;
    const threshold = Math.max(median * 4, 10000);

    const significantBids = bidWalls.filter((w) => w.valueUsd >= threshold).sort((a, b) => b.valueUsd - a.valueUsd);
    const significantAsks = askWalls.filter((w) => w.valueUsd >= threshold).sort((a, b) => b.valueUsd - a.valueUsd);

    return {
      topBidWall: significantBids[0] || null,
      topAskWall: significantAsks[0] || null,
      avgLevelUsd: avg,
    };
  }, [bids, asks]);

  // ⚖️ Emir Defteri Fiyat Etkisi (Price Impact) Analizi
  const impact = useMemo(() => analyzeOrderBookImpact(bids, asks), [bids, asks]);

  return (
    <div className="flex flex-col h-full bg-[#0d0e12]/80 border border-white/5 rounded-xl p-3 text-xs font-mono backdrop-blur select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-2">
        <div className="flex items-center gap-1.5 text-gray-300 font-sans font-semibold text-[11px]">
          <Layers size={13} className="text-violet-400" />
          <span>Emir Defteri</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400 uppercase">
            {exchange}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-sans">
          <span className="text-emerald-400 font-bold">{buyRatio}% Alış</span>
          <span className="text-rose-400 font-bold">{100 - buyRatio}% Satış</span>
        </div>
      </div>

      {/* Oran Barı */}
      <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden flex mb-2">
        <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${buyRatio}%` }} />
        <div className="bg-rose-500 h-full transition-all duration-300" style={{ width: `${100 - buyRatio}%` }} />
      </div>

      {/* ⚖️ Fiyat Etkisi Simülasyonu (Price Impact Strip) */}
      {impact && (
        <div
          className="mb-2 px-2 py-1.5 rounded-lg bg-white/[0.025] border border-white/5 flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-sans"
          title={impact.summaryText}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">
              ${formatVolume(impact.sampleOrderUsd)} Etki:
            </span>
            <span className="font-mono text-emerald-400 font-bold">
              Alım +%{impact.buyImpactPct.toFixed(2)}
            </span>
            <span className="text-gray-600">/</span>
            <span className="font-mono text-rose-400 font-bold">
              Satış -%{impact.sellImpactPct.toFixed(2)}
            </span>
          </div>

          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold text-[9px] border ${
              impact.direction === "BULLISH"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : impact.direction === "BEARISH"
                ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                : "bg-amber-500/15 text-amber-300 border-amber-500/30"
            }`}
          >
            {impact.direction === "BULLISH" ? (
              <TrendingUp size={10} />
            ) : impact.direction === "BEARISH" ? (
              <TrendingDown size={10} />
            ) : (
              <Scale size={10} />
            )}
            {impact.shortBadge}
          </span>
        </div>
      )}

      {/* 🐋 Balina Duvarları Özet HUD */}
      {(topBidWall || topAskWall) && (
        <div className="mb-2 p-1.5 rounded-lg bg-white/[0.02] border border-white/5 flex items-center justify-between gap-1 text-[10px] font-sans">
          {topBidWall ? (
            <div className="flex items-center gap-1 text-emerald-400 font-semibold truncate">
              <ShieldCheck size={11} className="shrink-0" />
              <span>Alış Duvarı:</span>
              <span className="font-mono text-white">${topBidWall.price.toFixed(topBidWall.price < 1 ? 4 : 2)}</span>
              <span className="text-[9px] text-emerald-300/80">(${(topBidWall.valueUsd / 1000).toFixed(0)}k)</span>
            </div>
          ) : (
            <span className="text-[9px] text-gray-600">Alış duvarı yok</span>
          )}

          {topAskWall ? (
            <div className="flex items-center gap-1 text-rose-400 font-semibold truncate text-right">
              <ShieldAlert size={11} className="shrink-0" />
              <span>Satış Duvarı:</span>
              <span className="font-mono text-white">${topAskWall.price.toFixed(topAskWall.price < 1 ? 4 : 2)}</span>
              <span className="text-[9px] text-rose-300/80">(${(topAskWall.valueUsd / 1000).toFixed(0)}k)</span>
            </div>
          ) : (
            <span className="text-[9px] text-gray-600">Satış duvarı yok</span>
          )}
        </div>
      )}

      {/* Sütun Başlıkları */}
      <div className="flex justify-between text-[10px] text-gray-500 font-sans pb-1 px-1">
        <span>Fiyat (USDT)</span>
        <span>Miktar</span>
      </div>

      {isLoading && bids.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 gap-2">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-[11px] font-sans">Derinlik yükleniyor...</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between overflow-hidden">
          {/* ASKS (Satışlar - Kırmızı) */}
          <div className="flex flex-col justify-end gap-[2px] overflow-hidden">
            {asks.slice(-7).map((ask, i) => {
              const price = parseFloat(ask[0]);
              const qty = parseFloat(ask[1]);
              const valUsd = price * qty;
              const barWidth = Math.min(100, Math.round((qty / maxVolume) * 100));
              const isWall = topAskWall && topAskWall.price === price;

              return (
                <div
                  key={`ask-${i}`}
                  className={`relative flex justify-between px-1 py-[2px] rounded transition-colors ${
                    isWall ? "bg-rose-500/20 border border-rose-500/40" : "hover:bg-white/[0.02]"
                  }`}
                >
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-rose-500/10 rounded-r"
                    style={{ width: `${barWidth}%` }}
                  />
                  <div className="relative z-10 flex items-center gap-1">
                    {isWall && <ShieldAlert size={10} className="text-rose-400 shrink-0" />}
                    <span className="text-rose-400 font-semibold">
                      {price.toFixed(price < 1 ? 4 : 2)}
                    </span>
                  </div>
                  <span className="relative z-10 text-gray-300">
                    {qty.toFixed(qty < 1 ? 4 : 2)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Ayrım Çizgisi */}
          <div className="my-1 border-t border-white/5" />

          {/* BIDS (Alışlar - Yeşil) */}
          <div className="flex flex-col justify-start gap-[2px] overflow-hidden">
            {bids.slice(0, 7).map((bid, i) => {
              const price = parseFloat(bid[0]);
              const qty = parseFloat(bid[1]);
              const valUsd = price * qty;
              const barWidth = Math.min(100, Math.round((qty / maxVolume) * 100));
              const isWall = topBidWall && topBidWall.price === price;

              return (
                <div
                  key={`bid-${i}`}
                  className={`relative flex justify-between px-1 py-[2px] rounded transition-colors ${
                    isWall ? "bg-emerald-500/20 border border-emerald-500/40" : "hover:bg-white/[0.02]"
                  }`}
                >
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-emerald-500/10 rounded-r"
                    style={{ width: `${barWidth}%` }}
                  />
                  <div className="relative z-10 flex items-center gap-1">
                    {isWall && <ShieldCheck size={10} className="text-emerald-400 shrink-0" />}
                    <span className="text-emerald-400 font-semibold">
                      {price.toFixed(price < 1 ? 4 : 2)}
                    </span>
                  </div>
                  <span className="relative z-10 text-gray-300">
                    {qty.toFixed(qty < 1 ? 4 : 2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
