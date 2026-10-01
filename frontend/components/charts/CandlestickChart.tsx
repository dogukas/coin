"use client";

// TradingView Lightweight Charts v5 integration with real-time updates
// Renders candlestick chart with volume, full EMA overlay paths, and Bollinger Bands

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type Time,
} from "lightweight-charts";
import { useDashboardStore } from "@/lib/store";
import { calculateEMA, calculateBollingerBands, calculateRSI, calculateMACD } from "@/lib/indicators";
import { formatNumber } from "@/lib/utils";

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
  
  // RSI & MACD References
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const lastCandleCountRef = useRef<number>(0);
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const activeInterval = useDashboardStore((s) => s.activeInterval);
  const prevKeyRef = useRef<string>(`${activeSymbol}_${activeInterval}`);

  const candles = useDashboardStore((s) => s.candles);
  const signalData = useDashboardStore((s) => s.signalData);

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
        scaleMargins: { top: 0.05, bottom: 0.35 },
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

    // Dedicated independent scale for volume to prevent contaminating price scale
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#26a69a",
      priceFormat: { type: "volume" },
      priceScaleId: "volume_scale",
    });

    chart.priceScale("volume_scale").applyOptions({
      scaleMargins: { top: 0.65, bottom: 0.35 },
      visible: false,
    });

    // RSI Pane
    const rsiSeries = chart.addSeries(LineSeries, {
      color: "#9333ea", // Purple
      lineWidth: 2,
      priceScaleId: "rsi_scale",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chart.priceScale("rsi_scale").applyOptions({
      scaleMargins: { top: 0.70, bottom: 0.15 },
      visible: false,
    });

    // MACD Pane
    const macdHistSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "macd_scale",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    
    const macdLineSeries = chart.addSeries(LineSeries, {
      color: "#3b82f6", // Blue
      lineWidth: 2,
      priceScaleId: "macd_scale",
      priceLineVisible: false,
      lastValueVisible: false,
    });
    
    const macdSignalSeries = chart.addSeries(LineSeries, {
      color: "#f59e0b", // Orange
      lineWidth: 2,
      priceScaleId: "macd_scale",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chart.priceScale("macd_scale").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
      visible: false,
    });

    // EMA lines (v5 API)
    const ema20Series = chart.addSeries(LineSeries, {
      color: "#00bcd4", // Cyan
      lineWidth: 2,
      title: "EMA20",
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const ema50Series = chart.addSeries(LineSeries, {
      color: "#ff9800", // Orange
      lineWidth: 2,
      title: "EMA50",
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const ema200Series = chart.addSeries(LineSeries, {
      color: "#b0bec5", // Light silver
      lineWidth: 1,
      title: "EMA200",
      priceLineVisible: false,
      lastValueVisible: true,
    });

    // Bollinger Bands (v5 API)
    const bbUpper = chart.addSeries(LineSeries, {
      color: "rgba(186, 104, 200, 0.7)",
      lineWidth: 1,
      lineStyle: 2, // Dashed
      title: "BB Üst",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const bbMiddle = chart.addSeries(LineSeries, {
      color: "rgba(186, 104, 200, 0.4)",
      lineWidth: 1,
      lineStyle: 3, // Dotted
      title: "BB Orta",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const bbLower = chart.addSeries(LineSeries, {
      color: "rgba(186, 104, 200, 0.7)",
      lineWidth: 1,
      lineStyle: 2, // Dashed
      title: "BB Alt",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ema20SeriesRef.current = ema20Series;
    ema50SeriesRef.current = ema50Series;
    ema200SeriesRef.current = ema200Series;
    bbUpperRef.current = bbUpper;
    bbMiddleRef.current = bbMiddle;
    bbMiddleRef.current = bbMiddle;
    bbLowerRef.current = bbLower;
    
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
      const rsiData = calculateRSI(candles, 14);
      const macdData = calculateMACD(candles);
      
      // MACD Histogram colors
      const macdHistFormatted: HistogramData<Time>[] = macdData.histogram.map(p => ({
        time: p.time,
        value: p.value,
        color: p.value >= 0 ? "rgba(0, 230, 118, 0.6)" : "rgba(239, 83, 80, 0.6)"
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
        
        // Note: RSI and MACD are not currently streamed continuously from Binance ticker.
        // For a full production bot, we would calculate incremental RSI/MACD here or rely on the backend.
        // We will just let the full update cycle (which happens on candle close) refresh them, or 
        // we could calculate incremental ones here if needed.
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
  }, [candles, signalData]);

  const ind = signalData?.indicators;

  return (
    <div className="relative w-full h-full min-h-[400px] flex-1">
      <div ref={chartContainerRef} className="absolute inset-0" />
      {/* Chart legend overlay with live values */}
      <div className="absolute top-3 left-3 flex flex-wrap items-center gap-3 text-[11px] font-mono backdrop-blur-sm bg-black/40 px-3 py-1.5 rounded-lg border border-white/5 pointer-events-none">
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

        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          <span className="text-purple-300 font-semibold">BB(20,2)</span>
          {ind?.bb_upper && ind?.bb_lower && (
            <span className="text-white/60 tabular-nums text-[10px]">
              [{formatNumber(ind.bb_lower)} - {formatNumber(ind.bb_upper)}]
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
