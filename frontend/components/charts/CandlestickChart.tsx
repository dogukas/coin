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
import { formatNumber, formatVolume, type CandleData } from "@/lib/utils";
import { analyzeOrderBookImpact, type PriceImpactAnalysis } from "@/lib/orderBookImpact";
import {
  analyzeLiquidationMagnets,
  calculateVolumeProfile,
  detectCandlePattern,
  analyzeSmartMoneyStructure,
  runSignalBacktest,
} from "@/lib/chartAnalytics";
import type { FuturesIntelPayload } from "@/app/api/market/futures/[symbol]/route";

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
  const tradePlanLinesRef = useRef<IPriceLine[]>([]);
  const swingHighLineRef = useRef<IPriceLine | null>(null);
  const swingLowLineRef = useRef<IPriceLine | null>(null);
  const pocLineRef = useRef<IPriceLine | null>(null);
  const shortLiqLineRef = useRef<IPriceLine | null>(null);
  const longLiqLineRef = useRef<IPriceLine | null>(null);
  const candlesByTimeRef = useRef<Map<number, CandleData>>(new Map());
  const [bookImpact, setBookImpact] = useState<PriceImpactAnalysis | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<CandleData | null>(null);
  const [countdownText, setCountdownText] = useState<string>("00:00");
  const [futuresIntel, setFuturesIntel] = useState<FuturesIntelPayload | null>(null);

  const lastCandleCountRef = useRef<number>(0);
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const activeInterval = useDashboardStore((s) => s.activeInterval);
  const chartTradePlan = useDashboardStore((s) => s.chartTradePlan);
  const prevKeyRef = useRef<string>(`${activeSymbol}_${activeInterval}`);

  const candles = useDashboardStore((s) => s.candles);
  const signalData = useDashboardStore((s) => s.signalData);

  // Indicator toggles state
  const [toggles, setToggles] = useState({
    chartInfo: true,
    vpvr: true,
    liqMagnet: true,
    backtest: false,
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

    // Crosshair (İmleç) Canlı Mum Denetçisi aboneliği
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHoveredCandle(null);
        return;
      }
      const t = typeof param.time === "number" ? param.time : Number(param.time);
      const found = candlesByTimeRef.current.get(t);
      setHoveredCandle(found ?? null);
    });

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
      candlesByTimeRef.current = new Map();
      setHoveredCandle(null);

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

    const nextMap = new Map<number, CandleData>();
    for (const c of candles) {
      nextMap.set(c.time, c);
    }
    candlesByTimeRef.current = nextMap;

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

  // Akıllı TP / SL Simülatöründen Gelen İşlem Planı Çizgilerini Mum Grafiğine Çiz
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    for (const line of tradePlanLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // ignore if already removed
      }
    }
    tradePlanLinesRef.current = [];

    if (!chartTradePlan || chartTradePlan.symbol !== activeSymbol || candles.length === 0) return;

    const entryLine = series.createPriceLine({
      price: chartTradePlan.entry,
      color: "#60a5fa",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      axisLabelVisible: true,
      title: `⚡ Giriş (${chartTradePlan.direction.toUpperCase()})`,
    });

    const slLine = series.createPriceLine({
      price: chartTradePlan.sl,
      color: "#f43f5e",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "🛑 Stop-Loss",
    });

    const tp1Line = series.createPriceLine({
      price: chartTradePlan.tp1,
      color: "#34d399",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "🎯 TP 1 (1:1.5)",
    });

    const tp2Line = series.createPriceLine({
      price: chartTradePlan.tp2,
      color: "#10b981",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: "🏆 TP 2 (Altın Hedef)",
    });

    tradePlanLinesRef.current = [entryLine, slLine, tp1Line, tp2Line];
  }, [chartTradePlan, activeSymbol, candles.length]);

  // Canlı Mum Kapanış Geri Sayım Sayacı (1m, 5m, 15m, 1h, 4h)
  useEffect(() => {
    const intervalSecMap: Record<string, number> = {
      "1m": 60,
      "5m": 300,
      "15m": 900,
      "1h": 3600,
      "4h": 14400,
    };
    const periodSec = intervalSecMap[activeInterval] ?? 60;

    const updateCountdown = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const rem = periodSec - (nowSec % periodSec);
      const hrs = Math.floor(rem / 3600);
      const mins = Math.floor((rem % 3600) / 60);
      const secs = rem % 60;
      if (hrs > 0) {
        setCountdownText(
          `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
        );
      } else {
        setCountdownText(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [activeInterval]);

  // Son 60 Mum Lokal Tepe (Swing High) & Lokal Dip (Swing Low) Çizgileri
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    if (swingHighLineRef.current) {
      try {
        series.removePriceLine(swingHighLineRef.current);
      } catch {
        // ignore if already removed
      }
      swingHighLineRef.current = null;
    }

    if (swingLowLineRef.current) {
      try {
        series.removePriceLine(swingLowLineRef.current);
      } catch {
        // ignore if already removed
      }
      swingLowLineRef.current = null;
    }

    if (!toggles.chartInfo || candles.length < 10) return;

    const windowCandles = candles.slice(-60);
    let maxHigh = -Infinity;
    let minLow = Infinity;
    for (const c of windowCandles) {
      if (c.high > maxHigh) maxHigh = c.high;
      if (c.low < minLow) minLow = c.low;
    }

    if (Number.isFinite(maxHigh) && maxHigh > 0) {
      swingHighLineRef.current = series.createPriceLine({
        price: maxHigh,
        color: "rgba(251, 146, 60, 0.55)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "📍 60M Tepe",
      });
    }

    if (Number.isFinite(minLow) && minLow > 0) {
      swingLowLineRef.current = series.createPriceLine({
        price: minLow,
        color: "rgba(56, 189, 248, 0.55)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "📍 60M Dip",
      });
    }
  }, [candles, toggles.chartInfo]);

  // 4. Binance Vadeli (Futures) Açık Pozisyon (OI), Fonlama & Balina Long/Short İstihbaratı
  useEffect(() => {
    let cancelled = false;
    setFuturesIntel(null);

    const fetchFuturesIntel = async () => {
      try {
        const res = await fetch(`/api/market/futures/${activeSymbol}`);
        if (!res.ok) return;
        const data = (await res.json()) as FuturesIntelPayload;
        if (!cancelled) setFuturesIntel(data);
      } catch {
        // graceful fallback
      }
    };

    fetchFuturesIntel();
    const timer = setInterval(fetchFuturesIntel, 25000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeSymbol]);

  // 1, 2, 3, 5. Likidasyon Mıknatısı, Hacim Profili (VPVR & POC), Smart Money (ICT) ve Canlı Backtest
  const liqMagnet = analyzeLiquidationMagnets(candles);
  const volumeProfile = calculateVolumeProfile(candles, 18);
  const smartMoney = analyzeSmartMoneyStructure(candles);
  const backtestReport = runSignalBacktest(candles);

  // POC (Adil Değer) ve 25x Likidasyon Mıknatısı Fiyat Çizgileri
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    if (pocLineRef.current) {
      try {
        series.removePriceLine(pocLineRef.current);
      } catch {
        // ignore
      }
      pocLineRef.current = null;
    }

    if (shortLiqLineRef.current) {
      try {
        series.removePriceLine(shortLiqLineRef.current);
      } catch {
        // ignore
      }
      shortLiqLineRef.current = null;
    }

    if (longLiqLineRef.current) {
      try {
        series.removePriceLine(longLiqLineRef.current);
      } catch {
        // ignore
      }
      longLiqLineRef.current = null;
    }

    if (candles.length < 15) return;

    if (toggles.vpvr && volumeProfile && volumeProfile.pocPrice > 0) {
      pocLineRef.current = series.createPriceLine({
        price: volumeProfile.pocPrice,
        color: "rgba(217, 70, 239, 0.85)",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `🧲 POC Adil Değer $${formatNumber(volumeProfile.pocPrice)}`,
      });
    }

    if (toggles.liqMagnet && liqMagnet) {
      shortLiqLineRef.current = series.createPriceLine({
        price: liqMagnet.shortLiq25x.price,
        color: "rgba(251, 113, 133, 0.78)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `🔥 25x Short Tasfiye (+%${liqMagnet.shortLiq25x.distancePct.toFixed(1)})`,
      });

      longLiqLineRef.current = series.createPriceLine({
        price: liqMagnet.longLiq25x.price,
        color: "rgba(52, 211, 153, 0.78)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `💧 25x Long Tasfiye (-%${liqMagnet.longLiq25x.distancePct.toFixed(1)})`,
      });
    }
  }, [candles.length, toggles.vpvr, toggles.liqMagnet, volumeProfile?.pocPrice, liqMagnet?.shortLiq25x.price, liqMagnet?.longLiq25x.price]);

  const ind = signalData?.indicators;

  // Grafik Üstü İnfo Katmanı Hesaplamaları (Canlı / İmleç Seçili Mum & Telemetri)
  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const inspectedCandle = hoveredCandle ?? latestCandle;
  const isHoveringHistorical =
    hoveredCandle !== null && latestCandle !== null && hoveredCandle.time !== latestCandle.time;

  // Seçili veya canlı mumun bir önceki mumunu bul (Mum Formasyonu tespiti için)
  let prevOfInspected: CandleData | null = null;
  if (inspectedCandle && candles.length > 1) {
    const idx = candles.findIndex((c) => c.time === inspectedCandle.time);
    if (idx > 0) prevOfInspected = candles[idx - 1];
  }
  const candlePattern = detectCandlePattern(inspectedCandle, prevOfInspected);

  const candleChangeAbs = inspectedCandle ? inspectedCandle.close - inspectedCandle.open : 0;
  const candleChangePct =
    inspectedCandle && inspectedCandle.open > 0
      ? (candleChangeAbs / inspectedCandle.open) * 100
      : 0;
  const candleUsdVol = inspectedCandle ? inspectedCandle.volume * inspectedCandle.close : 0;
  const candleBuyRatioPct = inspectedCandle
    ? inspectedCandle.volume > 0 && inspectedCandle.taker_buy_volume !== undefined
      ? (inspectedCandle.taker_buy_volume / inspectedCandle.volume) * 100
      : inspectedCandle.close >= inspectedCandle.open
      ? 56
      : 44
    : 50;

  const candleTimeLabel =
    inspectedCandle && isHoveringHistorical
      ? new Date(inspectedCandle.time * 1000).toLocaleString("tr-TR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "CANLI MUM";

  // Son 16 Mum Net CVD (Akıllı Para Akışı) & Son 14 Mum Oynaklık (ATR %) & 60M Kanal
  const recent16 = candles.slice(-16);
  let netCvdUsd = 0;
  for (const c of recent16) {
    const buyVol = c.taker_buy_volume !== undefined ? c.taker_buy_volume : c.volume * 0.5;
    const sellVol = Math.max(0, c.volume - buyVol);
    netCvdUsd += (buyVol - sellVol) * c.close;
  }

  const recent14 = candles.slice(-14);
  const avgRangePct =
    recent14.length > 0
      ? recent14.reduce((acc, c) => acc + (c.open > 0 ? ((c.high - c.low) / c.open) * 100 : 0), 0) /
        recent14.length
      : 0;

  const window60 = candles.slice(-60);
  let swingHigh = 0;
  let swingLow = 0;
  if (window60.length > 0) {
    swingHigh = Math.max(...window60.map((c) => c.high));
    swingLow = Math.min(...window60.map((c) => c.low));
  }
  const latestClose = latestCandle?.close ?? 0;
  const distToHighPct =
    swingHigh > 0 && latestClose > 0 ? ((swingHigh - latestClose) / latestClose) * 100 : 0;
  const distToLowPct =
    swingLow > 0 && latestClose > 0 ? ((latestClose - swingLow) / swingLow) * 100 : 0;
  const vwapDiffPct =
    ind?.vwap && latestClose > 0 ? ((latestClose - ind.vwap) / ind.vwap) * 100 : null;

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
            onClick={() => setToggles((t) => ({ ...t, chartInfo: !t.chartInfo }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium transition-all cursor-pointer ${
              toggles.chartInfo
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-[0_0_8px_rgba(14,165,233,0.25)]"
                : "text-gray-400 hover:text-gray-200 border border-transparent"
            }`}
            title="Grafik Üstü Canlı İnfo Katmanları & Mum Denetçisi"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${toggles.chartInfo ? "bg-sky-400" : "bg-gray-600"}`} />
            Grafik İnfo
          </button>

          <button
            onClick={() => setToggles((t) => ({ ...t, vpvr: !t.vpvr }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium transition-all cursor-pointer ${
              toggles.vpvr
                ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 shadow-[0_0_8px_rgba(217,70,239,0.25)]"
                : "text-gray-400 hover:text-gray-200 border border-transparent"
            }`}
            title="Grafik Üstü Hacim Profili (VPVR) & POC Adil Değer Mıknatısı"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${toggles.vpvr ? "bg-fuchsia-400" : "bg-gray-600"}`} />
            VPVR & POC
          </button>

          <button
            onClick={() => setToggles((t) => ({ ...t, liqMagnet: !t.liqMagnet }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium transition-all cursor-pointer ${
              toggles.liqMagnet
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.25)]"
                : "text-gray-400 hover:text-gray-200 border border-transparent"
            }`}
            title="25x / 50x Likidasyon (Tasfiye) Mıknatıs Bölgeleri"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${toggles.liqMagnet ? "bg-rose-400" : "bg-gray-600"}`} />
            Likidasyon
          </button>

          <button
            onClick={() => setToggles((t) => ({ ...t, backtest: !t.backtest }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium transition-all cursor-pointer ${
              toggles.backtest
                ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                : "text-emerald-400/90 hover:text-emerald-300 border border-emerald-500/20 bg-emerald-500/10"
            }`}
            title="Canlı Sinyal Geriye Dönük Test (Backtest) & Kazanma Oranı Karnesi"
          >
            <span>🧪 Backtest</span>
            {backtestReport && (
              <strong className="tabular-nums text-white">
                %{backtestReport.winRatePct.toFixed(0)}
              </strong>
            )}
          </button>

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
        {/* Grafik Üstü Sol HUD: Canlı / Seçili Mum Denetçisi (OHLCV) & Teknik/Akıllı Para Telemetri Şeridi */}
        {toggles.chartInfo && inspectedCandle && (
          <div className="absolute top-2.5 left-3 z-10 pointer-events-none flex flex-col gap-1.5 max-w-[calc(100%-95px)] sm:max-w-[calc(100%-240px)]">
            {/* Satır 1: Crosshair (İmleç) Canlı Mum Denetçisi (OHLCV + Mum İçi Alıcı/Satıcı Oranı + Mum Formasyonu) */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-2.5 py-1.5 rounded-xl bg-[#08090b]/85 border border-white/10 backdrop-blur-md shadow-lg text-[10px] font-mono">
              <span
                className={`px-1.5 py-0.5 rounded font-sans font-bold text-[9px] tracking-wide ${
                  isHoveringHistorical
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                }`}
              >
                {isHoveringHistorical ? `🔍 ${candleTimeLabel}` : "🟢 CANLI MUM"}
              </span>

              <span className="text-gray-400">
                A: <strong className="text-white tabular-nums">${formatNumber(inspectedCandle.open)}</strong>
              </span>
              <span className="text-gray-400">
                Y: <strong className="text-emerald-400 tabular-nums">${formatNumber(inspectedCandle.high)}</strong>
              </span>
              <span className="text-gray-400">
                D: <strong className="text-rose-400 tabular-nums">${formatNumber(inspectedCandle.low)}</strong>
              </span>
              <span className="text-gray-400">
                K: <strong className="text-white tabular-nums">${formatNumber(inspectedCandle.close)}</strong>
              </span>

              <span
                className={`px-1.5 py-0.5 rounded font-bold tabular-nums ${
                  candleChangePct >= 0
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-rose-500/15 text-rose-400"
                }`}
              >
                {candleChangePct >= 0 ? "+" : ""}
                {candleChangePct.toFixed(2)}%
              </span>

              <span className="text-gray-400">
                Hacim: <strong className="text-cyan-300 tabular-nums">${formatVolume(candleUsdVol)}</strong>
              </span>

              {/* Mum İçi Alıcı / Satıcı Baskı Mini Barı */}
              <div className="hidden md:flex items-center gap-1.5 pl-1 border-l border-white/10">
                <span className="text-emerald-400 font-bold tabular-nums">
                  Alıcı %{candleBuyRatioPct.toFixed(0)}
                </span>
                <div className="w-12 h-1.5 rounded-full bg-rose-500/40 overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-200"
                    style={{ width: `${Math.min(100, Math.max(0, candleBuyRatioPct))}%` }}
                  />
                </div>
                <span className="text-rose-400 font-bold tabular-nums">
                  %{(100 - candleBuyRatioPct).toFixed(0)}
                </span>
              </div>

              {/* 3. Otomatik Mum Formasyonu Rozeti (Hammer, Shooting Star, Engulfing, Marubozu, Doji) */}
              {candlePattern && (
                <span
                  className={`px-1.5 py-0.5 rounded font-sans font-bold text-[9px] border ${
                    candlePattern.tone === "BULL"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/35"
                      : candlePattern.tone === "BEAR"
                      ? "bg-rose-500/20 text-rose-300 border-rose-500/35"
                      : "bg-amber-500/20 text-amber-300 border-amber-500/35"
                  }`}
                >
                  {candlePattern.icon} {candlePattern.name}
                </span>
              )}
            </div>

            {/* Satır 2: Grafik Üstü Teknik & Akıllı Para (CVD) & 60M Kanal Telemetrisi */}
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
              {signalData && (
                <div
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border backdrop-blur-md ${
                    signalData.score >= 58
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                      : signalData.score <= 42
                      ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                      : "bg-[#08090b]/80 border-white/10 text-amber-300"
                  }`}
                >
                  <span className="font-sans font-bold">🎯 {signalData.label}</span>
                  <span className="text-white/80 tabular-nums">({signalData.score}P)</span>
                </div>
              )}

              {ind?.rsi !== null && ind?.rsi !== undefined && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#08090b]/80 border border-white/10 backdrop-blur-md text-gray-300">
                  <span>
                    RSI:{" "}
                    <strong
                      className={`tabular-nums ${
                        ind.rsi >= 70
                          ? "text-rose-400"
                          : ind.rsi <= 30
                          ? "text-emerald-400"
                          : "text-violet-300"
                      }`}
                    >
                      {ind.rsi.toFixed(1)}
                    </strong>
                  </span>
                  {vwapDiffPct !== null && (
                    <>
                      <span className="text-white/20">•</span>
                      <span>
                        VWAP:{" "}
                        <strong
                          className={`tabular-nums ${
                            vwapDiffPct >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {vwapDiffPct >= 0 ? "+" : ""}
                          {vwapDiffPct.toFixed(2)}% ({vwapDiffPct >= 0 ? "Üstü" : "Altı"})
                        </strong>
                      </span>
                    </>
                  )}
                </div>
              )}

              <div
                className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border backdrop-blur-md ${
                  netCvdUsd >= 0
                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/25 text-rose-300"
                }`}
              >
                <span className="font-sans font-semibold">🕵️‍♂️ 16m Net Akış:</span>
                <strong className="tabular-nums">
                  {netCvdUsd >= 0 ? "+" : "-"}${formatVolume(Math.abs(netCvdUsd))}
                </strong>
                <span className="text-[9px] opacity-80 font-sans">
                  ({netCvdUsd >= 0 ? "Alıcı Baskın" : "Satıcı Baskın"})
                </span>
              </div>

              {swingHigh > 0 && swingLow > 0 && (
                <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#08090b]/80 border border-white/10 backdrop-blur-md text-gray-300">
                  <span>
                    📍 60M Tepe:{" "}
                    <strong className="text-amber-300 tabular-nums">${formatNumber(swingHigh)}</strong>{" "}
                    <span className="text-gray-500">(-%{distToHighPct.toFixed(2)})</span>
                  </span>
                  <span className="text-white/20">•</span>
                  <span>
                    📍 60M Dip:{" "}
                    <strong className="text-sky-300 tabular-nums">${formatNumber(swingLow)}</strong>{" "}
                    <span className="text-gray-500">(+%{distToLowPct.toFixed(2)})</span>
                  </span>
                </div>
              )}
            </div>

            {/* Satır 3: Smart Money (ICT BOS/CHoCH/FVG) + Likidasyon Mıknatısı + POC + Vadeli (Futures) Şeridi */}
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
              {smartMoney && (
                <div
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border backdrop-blur-md ${
                    smartMoney.structureTone === "BULL"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                      : smartMoney.structureTone === "BEAR"
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                      : "bg-[#08090b]/80 border-white/10 text-gray-300"
                  }`}
                >
                  <span className="font-sans font-bold">{smartMoney.structureLabel}</span>
                  {smartMoney.nearestFvg && (
                    <>
                      <span className="text-white/20">•</span>
                      <span className="text-[9px]">
                        🕯️ {smartMoney.nearestFvg.type === "BULL_FVG" ? "Alış FVG" : "Satış FVG"}:{" "}
                        <strong className="text-white tabular-nums">
                          ${formatNumber(smartMoney.nearestFvg.mid)}
                        </strong>
                      </span>
                    </>
                  )}
                  {smartMoney.bbSqueeze && (
                    <span className="px-1 py-0.2 rounded bg-purple-500/30 text-purple-200 font-sans font-bold text-[9px]">
                      💥 BB Sıkışma
                    </span>
                  )}
                </div>
              )}

              {liqMagnet && (
                <div
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border backdrop-blur-md ${
                    liqMagnet.nearestMagnet === "SHORT_SQUEEZE"
                      ? "bg-rose-500/15 border-rose-500/30 text-rose-200"
                      : "bg-cyan-500/15 border-cyan-500/30 text-cyan-200"
                  }`}
                >
                  <span className="font-sans font-bold">
                    {liqMagnet.nearestMagnet === "SHORT_SQUEEZE"
                      ? "🔥 25x Short Mıknatıs:"
                      : "💧 25x Long Mıknatıs:"}
                  </span>
                  <strong className="tabular-nums">${formatNumber(liqMagnet.nearestPrice)}</strong>
                  <span className="text-[9px] opacity-80">
                    ({liqMagnet.nearestMagnet === "SHORT_SQUEEZE" ? "+" : "-"}%
                    {liqMagnet.nearestDistancePct.toFixed(2)})
                  </span>
                </div>
              )}

              {volumeProfile && (
                <div className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#08090b]/80 border border-fuchsia-500/30 backdrop-blur-md text-fuchsia-300">
                  <span className="font-sans font-bold">🧲 POC:</span>
                  <strong className="text-white tabular-nums">
                    ${formatNumber(volumeProfile.pocPrice)}
                  </strong>
                  <span className="text-[9px] text-fuchsia-200/80">
                    ({volumeProfile.pocDiffPct >= 0 ? "+" : ""}
                    {volumeProfile.pocDiffPct.toFixed(2)}%)
                  </span>
                </div>
              )}

              {futuresIntel?.available && (
                <div className="hidden xl:flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#08090b]/85 border border-amber-500/30 backdrop-blur-md text-gray-200">
                  <span className="text-amber-300 font-sans font-bold">⚡ Vadeli:</span>
                  <span>
                    Fonlama{" "}
                    <strong
                      className={`tabular-nums ${
                        futuresIntel.fundingRatePct < 0 ? "text-emerald-400" : "text-amber-300"
                      }`}
                    >
                      {futuresIntel.fundingRatePct >= 0 ? "+" : ""}
                      {futuresIntel.fundingRatePct.toFixed(4)}%
                    </strong>
                  </span>
                  <span className="text-white/20">•</span>
                  <span>
                    OI:{" "}
                    <strong className="text-cyan-300 tabular-nums">
                      ${formatVolume(futuresIntel.openInterestUsd)}
                    </strong>
                  </span>
                  <span className="text-white/20">•</span>
                  <span>
                    🐋 Balina:{" "}
                    <strong
                      className={`tabular-nums ${
                        futuresIntel.whaleLongPct >= 50 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      %{futuresIntel.whaleLongPct.toFixed(0)} Long
                    </strong>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Grafik Üstü Sağ HUD: Canlı Mum Kapanış Sayacı & Oynaklık (ATR) Rozeti */}
        {toggles.chartInfo && candles.length > 0 && (
          <div className="absolute top-2.5 right-[78px] z-10 pointer-events-none hidden sm:flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#08090b]/85 border border-white/10 backdrop-blur-md shadow-lg text-[10px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-gray-400 font-sans">⏱️ {activeInterval} Kapanış:</span>
              <strong className="text-amber-300 tabular-nums">{countdownText}</strong>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#08090b]/80 border border-white/10 backdrop-blur-md text-[9px] font-mono text-gray-400">
              <span>⚡ Oynaklık (14m):</span>
              <strong className="text-cyan-300 tabular-nums">%{avgRangePct.toFixed(2)}/mum</strong>
            </div>
          </div>
        )}

        {/* 2. Sağ Kenar Yatay Hacim Profili (VPVR) Histogram Katmanı */}
        {toggles.vpvr && volumeProfile && (
          <div
            className="absolute top-16 bottom-11 right-[66px] w-24 sm:w-28 z-10 pointer-events-none flex flex-col justify-between gap-[2px] opacity-80"
            title={`POC (Adil Değer): $${formatNumber(volumeProfile.pocPrice)} | Değer Alanı: $${formatNumber(volumeProfile.valPrice)} - $${formatNumber(volumeProfile.vahPrice)}`}
          >
            {volumeProfile.bins.map((bin) => (
              <div
                key={bin.index}
                className="w-full flex-1 flex items-center justify-end"
              >
                <div
                  className={`h-full rounded-l-sm overflow-hidden flex transition-all duration-300 ${
                    bin.isPoc
                      ? "ring-1 ring-fuchsia-400 shadow-[0_0_8px_rgba(217,70,239,0.65)]"
                      : bin.isValueArea
                      ? "opacity-85"
                      : "opacity-40"
                  }`}
                  style={{ width: `${Math.max(6, bin.widthPct)}%` }}
                >
                  <div
                    className="h-full bg-emerald-400/75"
                    style={{ width: `${bin.buyRatioPct}%` }}
                  />
                  <div
                    className="h-full bg-rose-400/75"
                    style={{ width: `${100 - bin.buyRatioPct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 5. Grafik Üstü Canlı Sinyal Backtest Karnesi (Toggles.backtest Açıkken) */}
        {toggles.backtest && backtestReport && (
          <div className="absolute bottom-9 left-3 z-20 w-[330px] sm:w-[380px] p-3 rounded-2xl bg-[#08090b]/95 border border-emerald-500/35 backdrop-blur-xl shadow-2xl text-[11px] font-mono">
            <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-white/10">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">🧪</span>
                <span className="font-sans font-bold text-white uppercase tracking-wider">
                  Canlı Sinyal Backtest ({activeInterval})
                </span>
              </div>
              <button
                onClick={() => setToggles((t) => ({ ...t, backtest: false }))}
                className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white text-[10px] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-2.5">
              <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="text-[9px] text-gray-400 font-sans">KAZANMA ORANI</div>
                <div
                  className={`text-sm font-bold tabular-nums ${
                    backtestReport.winRatePct >= 55 ? "text-emerald-400" : "text-amber-300"
                  }`}
                >
                  %{backtestReport.winRatePct.toFixed(1)}
                </div>
                <div className="text-[9px] text-gray-500">
                  {backtestReport.wins}K / {backtestReport.losses}Z ({backtestReport.totalTrades} işlem)
                </div>
              </div>

              <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="text-[9px] text-gray-400 font-sans">TOPLAM NET GETİRİ</div>
                <div
                  className={`text-sm font-bold tabular-nums ${
                    backtestReport.netReturnPct >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {backtestReport.netReturnPct >= 0 ? "+" : ""}
                  {backtestReport.netReturnPct.toFixed(2)}%
                </div>
                <div className="text-[9px] text-gray-500">
                  PF: {backtestReport.profitFactor.toFixed(2)}x
                </div>
              </div>

              <div className="p-2 rounded-xl bg-white/[0.03] border border-white/5">
                <div className="text-[9px] text-gray-400 font-sans">AKTİF SİNYAL</div>
                {backtestReport.activePosition ? (
                  <>
                    <div
                      className={`text-xs font-bold ${
                        backtestReport.activePosition.direction === "LONG"
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {backtestReport.activePosition.direction}{" "}
                      {backtestReport.activePosition.currentPnlPct >= 0 ? "+" : ""}
                      {backtestReport.activePosition.currentPnlPct.toFixed(2)}%
                    </div>
                    <div className="text-[9px] text-gray-500 tabular-nums">
                      @${formatNumber(backtestReport.activePosition.entryPrice)}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-gray-400">Beklemede</div>
                )}
              </div>
            </div>

            {backtestReport.recentTrades.length > 0 && (
              <div className="space-y-1">
                <div className="text-[9px] text-gray-400 font-sans uppercase tracking-wider">
                  Son Simüle Edilen Sinyaller:
                </div>
                {backtestReport.recentTrades.map((tr, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-2 py-1 rounded-lg bg-white/[0.02] border border-white/5 text-[10px]"
                  >
                    <span
                      className={`font-bold ${
                        tr.direction === "LONG" ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {tr.direction} (${formatNumber(tr.entryPrice)} → ${formatNumber(tr.exitPrice)})
                    </span>
                    <span
                      className={`font-bold tabular-nums ${
                        tr.outcome === "WIN" ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {tr.pnlPct >= 0 ? "+" : ""}
                      {tr.pnlPct.toFixed(2)}% ({tr.reason})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div ref={chartContainerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
