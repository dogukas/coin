"use client";

// TradingView Lightweight Charts v5 integration with real-time updates
// Renders candlestick chart with volume, full EMA overlay paths, Bollinger Bands, VWAP, and interactive toggles

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type IPriceLine,
  type CandlestickData,
  type HistogramData,
  type Time,
} from "lightweight-charts";
import { useDashboardStore } from "@/lib/store";
import {
  calculateEMA,
  calculateBollingerBands,
  calculateRSI,
  calculateMACD,
  calculateVWAP,
  calculateSignalMarkers,
  type ChartSignalMarker,
} from "@/lib/indicators";
import { formatNumber, formatVolume } from "@/lib/utils";
import { analyzeOrderBookImpact, type PriceImpactAnalysis } from "@/lib/orderBookImpact";

type MarkersPluginApi = ISeriesMarkersPluginApi<Time>;

export default function CandlestickChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMiddleRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersPluginRef = useRef<MarkersPluginApi | null>(null);
  const currentMarkersRef = useRef<ChartSignalMarker[]>([]);

  // RSI & MACD References
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // Emir Defteri Fiyat Etkisi (Destek & Direnç Duvarı) Fiyat Çizgileri
  const bidWallLineRef = useRef<IPriceLine | null>(null);
  const askWallLineRef = useRef<IPriceLine | null>(null);
  const [bookImpact, setBookImpact] = useState<PriceImpactAnalysis | null>(null);

  const lastCandleCountRef = useRef<number>(0);
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const activeInterval = useDashboardStore((s) => s.activeInterval);
  const prevKeyRef = useRef<string>(`${activeSymbol}_${activeInterval}`);

  const candles = useDashboardStore((s) => s.candles);
  const signalData = useDashboardStore((s) => s.signalData);

  // Indicator toggles state
  const [toggles, setToggles] = useState({
    ema: true,
    bb: true,
    vwap: true,
    signals: true,
    obImpact: true,
    rsi: false,
    macd: false,
  });

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.04)" },
        horzLines: { color: "rgba(255, 255, 255, 0.04)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(255, 255, 255, 0.2)",
          labelBackgroundColor: "#1e1e2e",
        },
        horzLine: {
          color: "rgba(255, 255, 255, 0.2)",
          labelBackgroundColor: "#1e1e2e",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        scaleMargins: { top: 0.08, bottom: 0.35 },
        autoScale: true,
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    // Candlestick series (v5 API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00e676",
      downColor: "#ef5350",
      borderUpColor: "#00e676",
      borderDownColor: "#ef5350",
      wickUpColor: "#00e676",
      wickDownColor: "#ef5350",
    });

    // Dedicated independent scale for volume
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#26a69a",
      priceFormat: { type: "volume" },
      priceScaleId: "volume_scale",
    });

    chart.priceScale("volume_scale").applyOptions({
      scaleMargins: { top: 0.70, bottom: 0.22 },
      visible: false,
    });

    // RSI Pane
    const rsiSeries = chart.addSeries(LineSeries, {
      color: "#9333ea", // Purple
      lineWidth: 2,
      priceScaleId: "rsi_scale",
      priceLineVisible: false,
      lastValueVisible: false,
      visible: toggles.rsi,
    });

    chart.priceScale("rsi_scale").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0.12 },
      visible: false,
    });

    // MACD Pane
    const macdHistSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "macd_scale",
      priceLineVisible: false,
      lastValueVisible: false,
      visible: toggles.macd,
    });
    
    const macdLineSeries = chart.addSeries(LineSeries, {
      color: "#3b82f6", // Blue
      lineWidth: 2,
      priceScaleId: "macd_scale",
      priceLineVisible: false,
      lastValueVisible: false,
      visible: toggles.macd,
    });
    
    const macdSignalSeries = chart.addSeries(LineSeries, {
      color: "#f59e0b", // Orange
      lineWidth: 2,
      priceScaleId: "macd_scale",
      priceLineVisible: false,
      lastValueVisible: false,
      visible: toggles.macd,
    });

    chart.priceScale("macd_scale").applyOptions({
      scaleMargins: { top: 0.88, bottom: 0 },
      visible: false,
    });

    // EMA lines (v5 API)
    const ema20Series = chart.addSeries(LineSeries, {
      color: "#00bcd4", // Cyan
      lineWidth: 2,
      title: "EMA20",
      priceLineVisible: false,
      lastValueVisible: true,
      visible: toggles.ema,
    });

    const ema50Series = chart.addSeries(LineSeries, {
      color: "#ff9800", // Orange
      lineWidth: 2,
      title: "EMA50",
      priceLineVisible: false,
      lastValueVisible: true,
      visible: toggles.ema,
    });

    const ema200Series = chart.addSeries(LineSeries, {
      color: "#b0bec5", // Light silver
      lineWidth: 1,
      title: "EMA200",
      priceLineVisible: false,
      lastValueVisible: true,
      visible: toggles.ema,
    });

    // Bollinger Bands (v5 API)
    const bbUpper = chart.addSeries(LineSeries, {
      color: "rgba(186, 104, 200, 0.75)",
      lineWidth: 1,
      lineStyle: 2, // Dashed
      title: "BB Üst",
      priceLineVisible: false,
      lastValueVisible: false,
      visible: toggles.bb,
    });

    const bbMiddle = chart.addSeries(LineSeries, {
      color: "rgba(186, 104, 200, 0.45)",
      lineWidth: 1,
      lineStyle: 3, // Dotted
      title: "BB Orta",
      priceLineVisible: false,
      lastValueVisible: false,
      visible: toggles.bb,
    });

    const bbLower = chart.addSeries(LineSeries, {
      color: "rgba(186, 104, 200, 0.75)",
      lineWidth: 1,
      lineStyle: 2, // Dashed
      title: "BB Alt",
      priceLineVisible: false,
      lastValueVisible: false,
      visible: toggles.bb,
    });

    // VWAP Line (Neon Magenta)
    const vwapSeries = chart.addSeries(LineSeries, {
      color: "#e040fb",
      lineWidth: 2,
      title: "VWAP",
      priceLineVisible: false,
      lastValueVisible: true,
      visible: toggles.vwap,
    });

    // Series Markers Plugin (v5 API)
    const markersPlugin = createSeriesMarkers(candleSeries);
    markersPluginRef.current = markersPlugin;

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ema20SeriesRef.current = ema20Series;
    ema50SeriesRef.current = ema50Series;
    ema200SeriesRef.current = ema200Series;
    bbUpperRef.current = bbUpper;
    bbMiddleRef.current = bbMiddle;
    bbLowerRef.current = bbLower;
    vwapSeriesRef.current = vwapSeries;
    
    rsiSeriesRef.current = rsiSeries;
    macdHistRef.current = macdHistSeries;
    macdLineRef.current = macdLineSeries;
    macdSignalRef.current = macdSignalSeries;

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Update visibility on toggle changes
  useEffect(() => {
    ema20SeriesRef.current?.applyOptions({ visible: toggles.ema });
    ema50SeriesRef.current?.applyOptions({ visible: toggles.ema });
    ema200SeriesRef.current?.applyOptions({ visible: toggles.ema });
    bbUpperRef.current?.applyOptions({ visible: toggles.bb });
    bbMiddleRef.current?.applyOptions({ visible: toggles.bb });
    bbLowerRef.current?.applyOptions({ visible: toggles.bb });
    vwapSeriesRef.current?.applyOptions({ visible: toggles.vwap });
    rsiSeriesRef.current?.applyOptions({ visible: toggles.rsi });
    macdHistRef.current?.applyOptions({ visible: toggles.macd });
    macdLineRef.current?.applyOptions({ visible: toggles.macd });
    macdSignalRef.current?.applyOptions({ visible: toggles.macd });

    if (markersPluginRef.current) {
      markersPluginRef.current.setMarkers(toggles.signals ? currentMarkersRef.current : []);
    }
  }, [toggles]);

  // Symbol or interval switch detection: clean up old series
  useEffect(() => {
    const currentKey = `${activeSymbol}_${activeInterval}`;
    if (prevKeyRef.current !== currentKey) {
      prevKeyRef.current = currentKey;
      lastCandleCountRef.current = 0;

      // Clear all series completely on symbol switch
      candleSeriesRef.current?.setData([]);
      volumeSeriesRef.current?.setData([]);
      ema20SeriesRef.current?.setData([]);
      ema50SeriesRef.current?.setData([]);
      ema200SeriesRef.current?.setData([]);
      bbUpperRef.current?.setData([]);
      bbMiddleRef.current?.setData([]);
      bbLowerRef.current?.setData([]);
      vwapSeriesRef.current?.setData([]);
      markersPluginRef.current?.setMarkers([]);
      currentMarkersRef.current = [];
      
      rsiSeriesRef.current?.setData([]);
      macdHistRef.current?.setData([]);
      macdLineRef.current?.setData([]);
      macdSignalRef.current?.setData([]);
    }
  }, [activeSymbol, activeInterval]);

  // Update data when candles change
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    const isFullUpdate =
      lastCandleCountRef.current === 0 ||
      Math.abs(candles.length - lastCandleCountRef.current) > 1;

    if (isFullUpdate) {
      // Full history load — map and set all series data
      const candleData: CandlestickData<Time>[] = candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      const volumeData: HistogramData<Time>[] = candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color:
          c.close >= c.open
            ? "rgba(0, 230, 118, 0.35)"
            : "rgba(239, 83, 80, 0.35)",
      }));

      // Calculate continuous historical indicator lines across all candles
      const ema20Data = calculateEMA(candles, 20);
      const ema50Data = calculateEMA(candles, 50);
      const ema200Data = calculateEMA(candles, 200);
      const bbData = calculateBollingerBands(candles, 20, 2.0);
      const vwapData = calculateVWAP(candles);
      const rsiData = calculateRSI(candles, 14);
      const macdData = calculateMACD(candles);
      const signalMarkers = calculateSignalMarkers(candles);
      
      currentMarkersRef.current = signalMarkers;

      // MACD Histogram colors
      const macdHistFormatted: HistogramData<Time>[] = macdData.histogram.map((p) => ({
        time: p.time,
        value: p.value,
        color: p.value >= 0 ? "rgba(0, 230, 118, 0.6)" : "rgba(239, 83, 80, 0.6)",
      }));

      // Populate chart series
      candleSeriesRef.current.setData(candleData);
      volumeSeriesRef.current?.setData(volumeData);
      ema20SeriesRef.current?.setData(ema20Data);
      ema50SeriesRef.current?.setData(ema50Data);
      ema200SeriesRef.current?.setData(ema200Data);
      bbUpperRef.current?.setData(bbData.upper);
      bbMiddleRef.current?.setData(bbData.middle);
      bbLowerRef.current?.setData(bbData.lower);
      vwapSeriesRef.current?.setData(vwapData);
      
      if (markersPluginRef.current) {
        markersPluginRef.current.setMarkers(toggles.signals ? signalMarkers : []);
      }

      rsiSeriesRef.current?.setData(rsiData);
      macdHistRef.current?.setData(macdHistFormatted);
      macdLineRef.current?.setData(macdData.macdLine);
      macdSignalRef.current?.setData(macdData.signalLine);

      lastCandleCountRef.current = candles.length;

      // Auto-fit content and ensure price scale matches active symbol bounds
      chartRef.current?.timeScale().fitContent();
      chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
    } else {
      // Incremental live update for latest candle
      const last = candles[candles.length - 1];
      const lastTime = last.time as Time;

      candleSeriesRef.current.update({
        time: lastTime,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
      });

      volumeSeriesRef.current?.update({
        time: lastTime,
        value: last.volume,
        color:
          last.close >= last.open
            ? "rgba(0, 230, 118, 0.35)"
            : "rgba(239, 83, 80, 0.35)",
      });

      // Update indicator points if signalData provides them
      if (signalData?.indicators) {
        const ind = signalData.indicators;
        if (ind.ema_20 !== null) {
          ema20SeriesRef.current?.update({ time: lastTime, value: ind.ema_20 });
        }
        if (ind.ema_50 !== null) {
          ema50SeriesRef.current?.update({ time: lastTime, value: ind.ema_50 });
        }
        if (ind.ema_200 !== null) {
          ema200SeriesRef.current?.update({ time: lastTime, value: ind.ema_200 });
        }
        if (ind.bb_upper !== null) {
          bbUpperRef.current?.update({ time: lastTime, value: ind.bb_upper });
        }
        if (ind.bb_middle !== null) {
          bbMiddleRef.current?.update({ time: lastTime, value: ind.bb_middle });
        }
        if (ind.bb_lower !== null) {
          bbLowerRef.current?.update({ time: lastTime, value: ind.bb_lower });
        }
        if (ind.vwap !== null) {
          vwapSeriesRef.current?.update({ time: lastTime, value: ind.vwap });
        }
        if (ind.rsi !== null && ind.rsi !== undefined) {
          rsiSeriesRef.current?.update({ time: lastTime, value: ind.rsi });
        }
        if (ind.macd_histogram !== null && ind.macd_line !== null && ind.macd_signal !== null) {
          macdHistRef.current?.update({ 
            time: lastTime, 
            value: ind.macd_histogram, 
            color: ind.macd_histogram >= 0 ? "rgba(0, 230, 118, 0.6)" : "rgba(239, 83, 80, 0.6)" 
          });
          macdLineRef.current?.update({ time: lastTime, value: ind.macd_line });
          macdSignalRef.current?.update({ time: lastTime, value: ind.macd_signal });
        }
      }
    }
  }, [candles, signalData, toggles.signals]);

  // Canlı Emir Defteri Fiyat Etkisi (L2 Depth20) Bağlantısı
  useEffect(() => {
    setBookImpact(null);
    const hosts = [
      "wss://data-stream.binance.vision:9443/ws",
      "wss://stream.binance.com:9443/ws",
    ];
    const cleanSym = activeSymbol.toLowerCase();
    let hostIndex = 0;
    let disposed = false;
    let gotData = false;
    let ws: WebSocket | null = null;
    let retryTimer: NodeJS.Timeout | null = null;
    let lastEmit = 0;

    const connect = () => {
      if (disposed) return;
      gotData = false;
      try {
        const socket = new WebSocket(`${hosts[hostIndex]}/${cleanSym}@depth20@100ms`);
        ws = socket;

        socket.onmessage = (event) => {
          if (disposed) return;
          const now = Date.now();
          if (now - lastEmit < 600) return; // Grafik performansını korumak için 600ms throttle
          try {
            const data = JSON.parse(event.data);
            if (Array.isArray(data.bids) && Array.isArray(data.asks) && data.bids.length > 0) {
              gotData = true;
              lastEmit = now;
              const analysis = analyzeOrderBookImpact(data.bids, data.asks);
              if (analysis) setBookImpact(analysis);
            }
          } catch {
            // ignore malformed frame
          }
        };

        const failOver = () => {
          if (disposed) return;
          socket.onclose = null;
          socket.onerror = null;
          if (!gotData) hostIndex = (hostIndex + 1) % hosts.length;
          retryTimer = setTimeout(connect, gotData ? 1500 : 2000);
        };
        socket.onerror = failOver;
        socket.onclose = failOver;
      } catch {
        retryTimer = setTimeout(connect, 2500);
      }
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    };
  }, [activeSymbol]);

  // Emir Defteri Destek / Direnç Duvarlarını Mum Grafiğine Fiyat Çizgisi Olarak Çiz
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    if (bidWallLineRef.current) {
      try {
        series.removePriceLine(bidWallLineRef.current);
      } catch {
        // ignore if already removed
      }
      bidWallLineRef.current = null;
    }

    if (askWallLineRef.current) {
      try {
        series.removePriceLine(askWallLineRef.current);
      } catch {
        // ignore if already removed
      }
      askWallLineRef.current = null;
    }

    if (!toggles.obImpact || !bookImpact || candles.length === 0) return;

    if (bookImpact.topBidWall) {
      bidWallLineRef.current = series.createPriceLine({
        price: bookImpact.topBidWall.price,
        color: "rgba(16, 185, 129, 0.85)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `🛡️ Alış Duvarı $${formatVolume(bookImpact.topBidWall.usd)}`,
      });
    }

    if (bookImpact.topAskWall) {
      askWallLineRef.current = series.createPriceLine({
        price: bookImpact.topAskWall.price,
        color: "rgba(239, 68, 68, 0.85)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `🧱 Satış Duvarı $${formatVolume(bookImpact.topAskWall.usd)}`,
      });
    }
  }, [bookImpact, toggles.obImpact, candles.length]);

  const ind = signalData?.indicators;

  return (
    <div className="relative w-full h-full min-h-[400px] flex-1 flex flex-col">
      {/* Top Chart Controls & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 px-3 border-b border-white/5 bg-black/40 backdrop-blur-sm z-20">
        {/* Left: Dynamic Live Indicator Values */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono">
          {toggles.ema && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#00bcd4" }} />
                <span className="text-cyan-400 font-semibold">EMA20</span>
                {ind?.ema_20 && (
                  <span className="text-white/80 tabular-nums">{formatNumber(ind.ema_20)}</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#ff9800" }} />
                <span className="text-amber-400 font-semibold">EMA50</span>
                {ind?.ema_50 && (
                  <span className="text-white/80 tabular-nums">{formatNumber(ind.ema_50)}</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#b0bec5" }} />
                <span className="text-gray-300 font-semibold">EMA200</span>
                {ind?.ema_200 && (
                  <span className="text-white/80 tabular-nums">{formatNumber(ind.ema_200)}</span>
                )}
              </div>
            </>
          )}

          {toggles.bb && ind?.bb_upper && ind?.bb_lower && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span className="text-purple-300 font-semibold">BB(20,2)</span>
              <span className="text-white/60 tabular-nums text-[10px]">
                [{formatNumber(ind.bb_lower)} - {formatNumber(ind.bb_upper)}]
              </span>
            </div>
          )}

          {toggles.vwap && ind?.vwap && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-fuchsia-400" />
              <span className="text-fuchsia-300 font-semibold">VWAP</span>
              <span className="text-white/80 tabular-nums">{formatNumber(ind.vwap)}</span>
            </div>
          )}

          {toggles.obImpact && bookImpact && (
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] ${
                bookImpact.direction === "BULLISH"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : bookImpact.direction === "BEARISH"
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-300"
              }`}
              title={bookImpact.summaryText}
            >
              <span className="font-sans font-bold">⚖️ {bookImpact.shortBadge}</span>
              <span className="text-white/75 tabular-nums">
                (${formatVolume(bookImpact.sampleOrderUsd)} →{" "}
                <strong className="text-emerald-400">+%{bookImpact.buyImpactPct.toFixed(2)}</strong> /{" "}
                <strong className="text-rose-400">-%{bookImpact.sellImpactPct.toFixed(2)}</strong>)
              </span>
            </div>
          )}
        </div>

        {/* Right: Interactive Indicator Layer Toggles */}
        <div className="flex flex-wrap items-center gap-1.5 bg-black/50 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => setToggles((t) => ({ ...t, ema: !t.ema }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium transition-all cursor-pointer ${
              toggles.ema
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.25)]"
                : "text-gray-400 hover:text-gray-200 border border-transparent"
            }`}
            title="EMA 20/50/200 Çizgileri"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${toggles.ema ? "bg-cyan-400" : "bg-gray-600"}`} />
            EMA
          </button>

          <button
            onClick={() => setToggles((t) => ({ ...t, bb: !t.bb }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium transition-all cursor-pointer ${
              toggles.bb
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.25)]"
                : "text-gray-400 hover:text-gray-200 border border-transparent"
            }`}
            title="Bollinger Bantları (Volatilite Kanalı)"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${toggles.bb ? "bg-purple-400" : "bg-gray-600"}`} />
            BB
          </button>

          <button
            onClick={() => setToggles((t) => ({ ...t, vwap: !t.vwap }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium transition-all cursor-pointer ${
              toggles.vwap
                ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 shadow-[0_0_8px_rgba(217,70,239,0.25)]"
                : "text-gray-400 hover:text-gray-200 border border-transparent"
            }`}
            title="Hacim Ağırlıklı Ortalama Fiyat (VWAP)"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${toggles.vwap ? "bg-fuchsia-400" : "bg-gray-600"}`} />
            VWAP
          </button>

          <button
            onClick={() => setToggles((t) => ({ ...t, signals: !t.signals }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium transition-all cursor-pointer ${
              toggles.signals
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.25)]"
                : "text-gray-400 hover:text-gray-200 border border-transparent"
            }`}
            title="Grafik Üzeri AL / SAT Okları"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${toggles.signals ? "bg-emerald-400" : "bg-gray-600"}`} />
            Sinyaller
          </button>

          <button
            onClick={() => setToggles((t) => ({ ...t, obImpact: !t.obImpact }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium transition-all cursor-pointer ${
              toggles.obImpact
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.25)]"
                : "text-gray-400 hover:text-gray-200 border border-transparent"
            }`}
            title="Emir Defteri Fiyat Etkisi & Destek/Direnç Duvarları"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${toggles.obImpact ? "bg-amber-400" : "bg-gray-600"}`} />
            Derinlik Etki
          </button>

          <button
            onClick={() => setToggles((t) => ({ ...t, rsi: !t.rsi }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium transition-all cursor-pointer ${
              toggles.rsi
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/40 shadow-[0_0_8px_rgba(139,92,246,0.25)]"
                : "text-gray-400 hover:text-gray-200 border border-transparent"
            }`}
            title="RSI(14) Grafiği"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${toggles.rsi ? "bg-violet-400" : "bg-gray-600"}`} />
            RSI
          </button>

          <button
            onClick={() => setToggles((t) => ({ ...t, macd: !t.macd }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium transition-all cursor-pointer ${
              toggles.macd
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-[0_0_8px_rgba(59,130,246,0.25)]"
                : "text-gray-400 hover:text-gray-200 border border-transparent"
            }`}
            title="MACD Grafiği"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${toggles.macd ? "bg-blue-400" : "bg-gray-600"}`} />
            MACD
          </button>
        </div>
      </div>

      {/* Main Chart Canvas */}
      <div className="relative flex-1 w-full min-h-[360px]">
        <div ref={chartContainerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
