"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboardStore } from "@/lib/store";
import { Activity } from "lucide-react";

interface Point {
  price: number;
  total: number;
}

export default function DepthChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  
  const [bids, setBids] = useState<Point[]>([]);
  const [asks, setAsks] = useState<Point[]>([]);
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

  // Connect to Binance @depth20@100ms
  useEffect(() => {
    let ws: WebSocket;
    let isMounted = true;
    setLoading(true);

    const connect = () => {
      const streamName = `${activeSymbol.toLowerCase()}@depth20@100ms`;
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamName}`);

      ws.onmessage = (event) => {
        if (!isMounted) return;
        setLoading(false);
        const data = JSON.parse(event.data);
        
        if (data.bids && data.asks) {
          let cumulativeBids = 0;
          // Binance sends bids sorted descending by price (best bid first).
          // We want the x-axis to be price ascending, so we reverse it.
          const bidsData: Point[] = [...data.bids].map((bid: string[]) => {
            cumulativeBids += parseFloat(bid[1]);
            return { price: parseFloat(bid[0]), total: cumulativeBids };
          });
          // Reverse back so it goes from lowest price (left) to highest bid price (center)
          bidsData.reverse();
          // Recalculate cumulative from the outside in to match the mountain shape properly
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
        }
      };

      ws.onerror = (err) => {
        console.error("Depth WS error", err);
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (ws) ws.close();
    };
  }, [activeSymbol]);

  // SVG Drawing Logic
  const { width, height } = dimensions;
  const padding = { top: 20, right: 10, bottom: 30, left: 10 };
  const innerWidth = Math.max(0, width - padding.left - padding.right);
  const innerHeight = Math.max(0, height - padding.top - padding.bottom);

  let bidPath = "";
  let askPath = "";
  let midPrice = 0;

  if (bids.length > 0 && asks.length > 0 && innerWidth > 0 && innerHeight > 0) {
    const minPrice = bids[0].price;
    const maxPrice = asks[asks.length - 1].price;
    const maxTotal = Math.max(
      bids[bids.length - 1].total,
      asks[asks.length - 1].total
    );

    midPrice = (bids[bids.length - 1].price + asks[0].price) / 2;

    const scaleX = (price: number) => padding.left + ((price - minPrice) / (maxPrice - minPrice)) * innerWidth;
    const scaleY = (total: number) => padding.top + innerHeight - (total / maxTotal) * innerHeight;

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

      {!loading && width > 0 && height > 0 && (
        <svg width={width} height={height} className="overflow-visible">
          {/* Grid lines */}
          <line x1={padding.left} y1={padding.top} x2={width - padding.right} y2={padding.top} stroke="rgba(255,255,255,0.05)" />
          <line x1={padding.left} y1={padding.top + innerHeight / 2} x2={width - padding.right} y2={padding.top + innerHeight / 2} stroke="rgba(255,255,255,0.05)" />
          <line x1={padding.left} y1={padding.top + innerHeight} x2={width - padding.right} y2={padding.top + innerHeight} stroke="rgba(255,255,255,0.05)" />
          
          {/* Mid price line */}
          {midPrice > 0 && (
            <line 
              x1={padding.left + ((midPrice - bids[0].price) / (asks[asks.length - 1].price - bids[0].price)) * innerWidth} 
              y1={padding.top} 
              x2={padding.left + ((midPrice - bids[0].price) / (asks[asks.length - 1].price - bids[0].price)) * innerWidth} 
              y2={padding.top + innerHeight} 
              stroke="rgba(255,255,255,0.2)" 
              strokeDasharray="4 4" 
            />
          )}

          {/* Area Paths */}
          <path d={bidPath} fill="rgba(16, 185, 129, 0.2)" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
          <path d={askPath} fill="rgba(239, 68, 68, 0.2)" stroke="#ef4444" strokeWidth="2" strokeLinejoin="round" />
          
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
