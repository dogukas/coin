"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi, ISeriesApi } from "lightweight-charts";
import { useDashboardStore } from "@/lib/store";
import { Activity } from "lucide-react";

export default function DepthChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const bidsSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const asksSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const [loading, setLoading] = useState(true);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#6B7280", // gray-500
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.03)" },
        horzLines: { color: "rgba(255, 255, 255, 0.03)" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          return time.toString();
        },
      },
      crosshair: {
        mode: 0, // Normal mode
        vertLine: {
          color: "rgba(255, 255, 255, 0.1)",
          width: 1,
          style: 3,
          labelBackgroundColor: "#1e1e2d",
        },
        horzLine: {
          color: "rgba(255, 255, 255, 0.1)",
          width: 1,
          style: 3,
          labelBackgroundColor: "#1e1e2d",
        },
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    chartRef.current = chart;

    bidsSeriesRef.current = chart.addAreaSeries({
      lineColor: "rgba(16, 185, 129, 1)", // Emerald 500
      topColor: "rgba(16, 185, 129, 0.4)",
      bottomColor: "rgba(16, 185, 129, 0.05)",
      lineWidth: 2,
      priceFormat: {
        type: "volume",
      },
    });

    asksSeriesRef.current = chart.addAreaSeries({
      lineColor: "rgba(239, 68, 68, 1)", // Red 500
      topColor: "rgba(239, 68, 68, 0.4)",
      bottomColor: "rgba(239, 68, 68, 0.05)",
      lineWidth: 2,
      priceFormat: {
        type: "volume",
      },
    });

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    
    // Initial size
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  // Connect to Binance @depth20@100ms
  useEffect(() => {
    if (!bidsSeriesRef.current || !asksSeriesRef.current) return;

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
          const bidsData = [...data.bids].reverse().map((bid: string[]) => {
            cumulativeBids += parseFloat(bid[1]);
            return {
              time: parseFloat(bid[0]),
              value: cumulativeBids,
            };
          });

          let cumulativeAsks = 0;
          const asksData = data.asks.map((ask: string[]) => {
            cumulativeAsks += parseFloat(ask[1]);
            return {
              time: parseFloat(ask[0]),
              value: cumulativeAsks,
            };
          });

          // Update series
          bidsSeriesRef.current?.setData(bidsData);
          asksSeriesRef.current?.setData(asksData);
          
          // Auto scale x-axis (price)
          if (bidsData.length > 0 && asksData.length > 0) {
            chartRef.current?.timeScale().setVisibleLogicalRange({
              from: 0,
              to: bidsData.length + asksData.length,
            });
          }
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

  return (
    <div className="w-full h-full relative">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#020205]/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Activity className="w-8 h-8 text-emerald-500 animate-pulse" />
            <span className="text-sm text-emerald-500 font-mono">Derinlik yükleniyor...</span>
          </div>
        </div>
      )}
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
}
