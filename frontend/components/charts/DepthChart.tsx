"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardStore } from "@/lib/store";
import { Activity, ShieldCheck, ShieldAlert, TrendingUp, TrendingDown, Scale } from "lucide-react";
import { analyzeOrderBookImpact } from "@/lib/orderBookImpact";
import { formatPrice, formatVolume } from "@/lib/utils";

interface Point {
  price: number;
  total: number;
}

export default function DepthChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  
  const [bids, setBids] = useState<Point[]>([]);
  const [asks, setAsks] = useState<Point[]>([]);
  const [rawBids, setRawBids] = useState<[string, string][]>([]);
  const [rawAsks, setRawAsks] = useState<[string, string][]>([]);
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setDimensions({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height,
        });
      }
    });
    
    if (containerRef.current) {
      observer.observe(containerRef.current);
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    }
    
    return () => observer.disconnect();
  }, []);

  // Connect to Binance or MEXC as fallback
  useEffect(() => {
    let ws: WebSocket | null = null;
    let isMounted = true;
    let currentEndpointIndex = 0;

    const endpoints = [
      {
        provider: "binance-vision",
        url: "wss://data-stream.binance.vision:9443/ws",
        getStreamPath: (symbol: string) => `/${symbol.toLowerCase()}@depth20@100ms`,
        getSubscribeMsg: null,
      },
      {
        provider: "binance",
        url: "wss://stream.binance.com:9443/ws",
        getStreamPath: (symbol: string) => `/${symbol.toLowerCase()}@depth20@100ms`,
        getSubscribeMsg: null,
      },
      {
        provider: "mexc",
        url: "wss://wbs.mexc.com/ws",
        getStreamPath: () => "",
        getSubscribeMsg: (symbol: string) => JSON.stringify({
          method: "SUBSCRIPTION",
          params: [`spot@public.limit.depth.v3.api@${symbol.toUpperCase()}@20`]
        }),
      }
    ];

    setLoading(true);
    let hasLoaded = false;

    const connect = () => {
      if (!isMounted) return;
      if (ws) {
        ws.close();
        ws = null;
      }

      const endpoint = endpoints[currentEndpointIndex];
      const url = `${endpoint.url}${endpoint.getStreamPath(activeSymbol)}`;
      
      try {
        ws = new WebSocket(url);
      } catch (err) {
        console.error("Depth WS creation error:", err);
        handleFallback();
        return;
      }

      ws.onopen = () => {
        console.log(`Connected to Depth WS: ${url}`);
        if (endpoint.getSubscribeMsg) {
          ws?.send(endpoint.getSubscribeMsg(activeSymbol));
        }
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        // Handle MEXC format (data is inside 'd')
        if (endpoint.provider === "mexc") {
          if (data && data.d && data.d.bids && data.d.asks) {
            data = data.d;
          } else {
            return; // Ignore ping/pong or subscription acks
          }
        }
        
        if (data && data.bids && data.asks && data.bids.length > 0) {
          hasLoaded = true;
          setLoading(false);
          let cumulativeBids = 0;
          // Bids are sorted descending by price (best bid first). We reverse for x-axis.
          const bidsData: Point[] = [...data.bids].map((bid: string[]) => {
            cumulativeBids += parseFloat(bid[1]);
            return { price: parseFloat(bid[0]), total: cumulativeBids };
          });
          
          bidsData.reverse();
          let totalBids = 0;
          for (let i = 0; i < bidsData.length; i++) {
             totalBids += parseFloat(data.bids[data.bids.length - 1 - i][1]);
             bidsData[i].total = totalBids;
          }

          let cumulativeAsks = 0;
          // Asks are sorted ascending (best ask first).
          const asksData: Point[] = data.asks.map((ask: string[]) => {
            cumulativeAsks += parseFloat(ask[1]);
            return { price: parseFloat(ask[0]), total: cumulativeAsks };
          });

          setBids(bidsData);
          setAsks(asksData);
          setRawBids(data.bids as [string, string][]);
          setRawAsks(data.asks as [string, string][]);
        }
      };

      ws.onerror = () => {
        console.error(`Depth WS error on ${url}`);
        handleFallback();
      };
      
      ws.onclose = () => {
        if (isMounted) {
          // If we close unexpectedly and we haven't loaded yet, try fallback
          if (!hasLoaded) {
            handleFallback();
          } else {
            setTimeout(() => connect(), 5000);
          }
        }
      };
    };

    const handleFallback = () => {
      if (!isMounted) return;
      currentEndpointIndex++;
      if (currentEndpointIndex < endpoints.length) {
        console.log(`Falling back to ${endpoints[currentEndpointIndex].provider}`);
        // Nullify onclose before re-connecting to prevent loop
        if (ws) ws.onclose = null;
        setTimeout(connect, 1000);
      } else {
        console.error("All Depth WS endpoints failed.");
        currentEndpointIndex = 0;
        setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [activeSymbol]);

  const impact = useMemo(() => analyzeOrderBookImpact(rawBids, rawAsks), [rawBids, rawAsks]);

  // SVG Drawing Logic
  const { width, height } = dimensions;
  const padding = { top: impact ? 86 : 20, right: 12, bottom: 30, left: 12 };
  const innerWidth = Math.max(0, width - padding.left - padding.right);
  const innerHeight = Math.max(0, height - padding.top - padding.bottom);

  let bidPath = "";
  let askPath = "";
  let midPrice = 0;
  let bidWallCoord: { x: number; y: number } | null = null;
  let askWallCoord: { x: number; y: number } | null = null;
  let buyReachCoord: { x: number; y: number } | null = null;
  let sellReachCoord: { x: number; y: number } | null = null;

  if (bids.length > 0 && asks.length > 0 && innerWidth > 0 && innerHeight > 0) {
    const minPrice = bids[0].price;
    const maxPrice = asks[asks.length - 1].price;
    const priceSpan = Math.max(1e-9, maxPrice - minPrice);
    const maxTotal = Math.max(
      1e-9,
      bids[bids.length - 1].total,
      asks[asks.length - 1].total
    );

    midPrice = (bids[bids.length - 1].price + asks[0].price) / 2;

    const scaleX = (price: number) =>
      padding.left + Math.min(1, Math.max(0, (price - minPrice) / priceSpan)) * innerWidth;
    const scaleY = (total: number) =>
      padding.top + innerHeight - Math.min(1, Math.max(0, total / maxTotal)) * innerHeight;

    // Draw Bids
    bidPath = `M ${scaleX(minPrice)} ${padding.top + innerHeight} `;
    bids.forEach((p) => {
      bidPath += `L ${scaleX(p.price)} ${scaleY(p.total)} `;
    });
    bidPath += `L ${scaleX(bids[bids.length - 1].price)} ${padding.top + innerHeight} Z`;

    // Draw Asks
    askPath = `M ${scaleX(asks[0].price)} ${padding.top + innerHeight} `;
    asks.forEach((p) => {
      askPath += `L ${scaleX(p.price)} ${scaleY(p.total)} `;
    });
    askPath += `L ${scaleX(maxPrice)} ${padding.top + innerHeight} Z`;

    if (impact?.topBidWall) {
      const match = bids.reduce((best, curr) =>
        Math.abs(curr.price - impact.topBidWall!.price) < Math.abs(best.price - impact.topBidWall!.price) ? curr : best
      , bids[0]);
      bidWallCoord = { x: scaleX(match.price), y: scaleY(match.total) };
    }

    if (impact?.topAskWall) {
      const match = asks.reduce((best, curr) =>
        Math.abs(curr.price - impact.topAskWall!.price) < Math.abs(best.price - impact.topAskWall!.price) ? curr : best
      , asks[0]);
      askWallCoord = { x: scaleX(match.price), y: scaleY(match.total) };
    }

    if (impact) {
      const buyMatch = asks.reduce((best, curr) =>
        Math.abs(curr.price - impact.buyReachPrice) < Math.abs(best.price - impact.buyReachPrice) ? curr : best
      , asks[0]);
      buyReachCoord = { x: scaleX(buyMatch.price), y: scaleY(buyMatch.total) };

      const sellMatch = bids.reduce((best, curr) =>
        Math.abs(curr.price - impact.sellReachPrice) < Math.abs(best.price - impact.sellReachPrice) ? curr : best
      , bids[0]);
      sellReachCoord = { x: scaleX(sellMatch.price), y: scaleY(sellMatch.total) };
    }
  }

  return (
    <div className="w-full h-full relative bg-transparent" ref={containerRef}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#020205]/50 backdrop-blur-sm rounded-lg">
          <div className="flex flex-col items-center gap-3">
            <Activity className="w-8 h-8 text-emerald-500 animate-pulse" />
            <span className="text-sm text-emerald-500 font-mono">Derinlik yükleniyor...</span>
          </div>
        </div>
      )}

      {/* Fiyat Etkisi Analizi Üst HUD Barı (Yapıyı bozmadan grafik içi overlay) */}
      {!loading && impact && (
        <div className="absolute top-2 left-2.5 right-2.5 z-10 pointer-events-none flex flex-col gap-1.5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5 bg-[#08090c]/85 backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] font-mono">
            {/* Sol: Alış Derinliği & Satışın Aşağı Fiyat Etkisi */}
            <div className="flex items-center justify-between md:justify-start gap-2">
              <div className="flex items-center gap-1 text-emerald-400 font-bold">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Alış: ${formatVolume(impact.totalBidUsd)} (%{impact.bidSharePct.toFixed(0)})</span>
              </div>
              <span className="text-gray-500">|</span>
              <span className="text-gray-300 truncate">
                ${formatVolume(impact.sampleOrderUsd)} Satış Etkisi:{" "}
                <strong className="text-rose-400">-%{impact.sellImpactPct.toFixed(2)}</strong>
              </span>
            </div>

            {/* Orta: Net Fiyat Etkisi Yönü */}
            <div className="flex items-center justify-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-sans font-bold text-[10px] border ${
                  impact.direction === "BULLISH"
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                    : impact.direction === "BEARISH"
                    ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
                    : "bg-amber-500/15 text-amber-300 border-amber-500/40"
                }`}
              >
                {impact.direction === "BULLISH" ? (
                  <TrendingUp className="w-3 h-3" />
                ) : impact.direction === "BEARISH" ? (
                  <TrendingDown className="w-3 h-3" />
                ) : (
                  <Scale className="w-3 h-3" />
                )}
                {impact.shortBadge}
              </span>
            </div>

            {/* Sağ: Satış Derinliği & Alımın Yukarı Fiyat Etkisi */}
            <div className="flex items-center justify-between md:justify-end gap-2">
              <span className="text-gray-300 truncate">
                ${formatVolume(impact.sampleOrderUsd)} Alım Etkisi:{" "}
                <strong className="text-emerald-400">+%{impact.buyImpactPct.toFixed(2)}</strong>
              </span>
              <span className="text-gray-500">|</span>
              <div className="flex items-center gap-1 text-rose-400 font-bold">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>Satış: ${formatVolume(impact.totalAskUsd)} (%{(100 - impact.bidSharePct).toFixed(0)})</span>
              </div>
            </div>
          </div>

          {/* Alt Bilgi Satırı: Tek Cümlelik Fiyat Etkisi Yorumu */}
          <div className="hidden sm:flex items-center justify-between px-2.5 py-1 rounded bg-black/55 border border-white/5 text-[10px] font-sans text-gray-300">
            <span className="truncate">{impact.summaryText}</span>
            <span className="font-mono text-[10px] text-gray-400 shrink-0 ml-2">
              Spread: %{impact.spreadPct.toFixed(3)}
            </span>
          </div>
        </div>
      )}

      {!loading && width > 0 && height > 0 && (
        <svg width={width} height={height} className="overflow-visible">
          {/* Grid lines */}
          <line x1={padding.left} y1={padding.top} x2={width - padding.right} y2={padding.top} stroke="rgba(255,255,255,0.05)" />
          <line x1={padding.left} y1={padding.top + innerHeight / 2} x2={width - padding.right} y2={padding.top + innerHeight / 2} stroke="rgba(255,255,255,0.05)" />
          <line x1={padding.left} y1={padding.top + innerHeight} x2={width - padding.right} y2={padding.top + innerHeight} stroke="rgba(255,255,255,0.05)" />
          
          {/* Mid price line */}
          {midPrice > 0 && (
            <line 
              x1={padding.left + ((midPrice - bids[0].price) / Math.max(1e-9, asks[asks.length - 1].price - bids[0].price)) * innerWidth} 
              y1={padding.top} 
              x2={padding.left + ((midPrice - bids[0].price) / Math.max(1e-9, asks[asks.length - 1].price - bids[0].price)) * innerWidth} 
              y2={padding.top + innerHeight} 
              stroke="rgba(255,255,255,0.2)" 
              strokeDasharray="4 4" 
            />
          )}

          {/* Area Paths */}
          <path d={bidPath} fill="rgba(16, 185, 129, 0.2)" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
          <path d={askPath} fill="rgba(239, 68, 68, 0.2)" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" />

          {/* Satışta Fiyat Etkisi Menzili (Sell Impact Reach) */}
          {sellReachCoord && impact && (
            <g>
              <line
                x1={sellReachCoord.x}
                y1={sellReachCoord.y}
                x2={sellReachCoord.x}
                y2={padding.top + innerHeight}
                stroke="rgba(251, 191, 36, 0.45)"
                strokeDasharray="2 2"
              />
              <circle cx={sellReachCoord.x} cy={sellReachCoord.y} r={3.5} fill="#fbbf24" />
            </g>
          )}

          {/* Alımda Fiyat Etkisi Menzili (Buy Impact Reach) */}
          {buyReachCoord && impact && (
            <g>
              <line
                x1={buyReachCoord.x}
                y1={buyReachCoord.y}
                x2={buyReachCoord.x}
                y2={padding.top + innerHeight}
                stroke="rgba(34, 211, 238, 0.45)"
                strokeDasharray="2 2"
              />
              <circle cx={buyReachCoord.x} cy={buyReachCoord.y} r={3.5} fill="#22d3ee" />
            </g>
          )}

          {/* En Güçlü Alış Duvarı (Destek) İşaretçisi */}
          {bidWallCoord && impact?.topBidWall && (
            <g>
              <line
                x1={bidWallCoord.x}
                y1={bidWallCoord.y}
                x2={bidWallCoord.x}
                y2={padding.top + innerHeight}
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <circle cx={bidWallCoord.x} cy={bidWallCoord.y} r={5} fill="#10b981" stroke="#052e16" strokeWidth="2" />
              <text
                x={Math.max(padding.left + 45, Math.min(width / 2 - 45, bidWallCoord.x))}
                y={Math.max(padding.top + 14, bidWallCoord.y - 8)}
                fill="#34d399"
                fontSize="10"
                fontWeight="700"
                textAnchor="middle"
              >
                Destek ${formatPrice(impact.topBidWall.price)} (${formatVolume(impact.topBidWall.usd)})
              </text>
            </g>
          )}

          {/* En Güçlü Satış Duvarı (Direnç) İşaretçisi */}
          {askWallCoord && impact?.topAskWall && (
            <g>
              <line
                x1={askWallCoord.x}
                y1={askWallCoord.y}
                x2={askWallCoord.x}
                y2={padding.top + innerHeight}
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <circle cx={askWallCoord.x} cy={askWallCoord.y} r={5} fill="#ef4444" stroke="#450a0a" strokeWidth="2" />
              <text
                x={Math.min(width - padding.right - 45, Math.max(width / 2 + 45, askWallCoord.x))}
                y={Math.max(padding.top + 14, askWallCoord.y - 8)}
                fill="#f87171"
                fontSize="10"
                fontWeight="700"
                textAnchor="middle"
              >
                Direnç ${formatPrice(impact.topAskWall.price)} (${formatVolume(impact.topAskWall.usd)})
              </text>
            </g>
          )}
          
          {/* Labels */}
          {bids.length > 0 && (
            <text x={padding.left} y={height - 10} fill="#6B7280" fontSize="11" fontWeight="600">
              {bids[0].price.toFixed(bids[0].price > 10 ? 2 : 5)}
            </text>
          )}
          {asks.length > 0 && (
            <text x={width - padding.right} y={height - 10} fill="#6B7280" fontSize="11" fontWeight="600" textAnchor="end">
              {asks[asks.length - 1].price.toFixed(asks[asks.length - 1].price > 10 ? 2 : 5)}
            </text>
          )}
          {midPrice > 0 && (
            <text x={width / 2} y={height - 10} fill="#9ca3af" fontSize="12" fontWeight="700" textAnchor="middle">
              {midPrice.toFixed(midPrice > 10 ? 2 : 5)}
            </text>
          )}
        </svg>
      )}
    </div>
  );
}
