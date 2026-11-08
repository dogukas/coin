// Pure TypeScript technical indicator calculators for chart overlays
// Synchronized with Binance kline timestamps for lightweight-charts

import type { CandleData } from "./utils";
import type { Time } from "lightweight-charts";

export interface LinePoint {
  time: Time;
  value: number;
}

export interface BollingerBandsResult {
  upper: LinePoint[];
  middle: LinePoint[];
  lower: LinePoint[];
}

/**
 * Calculates Exponential Moving Average (EMA) matching pandas ewm(span=period, adjust=False).mean()
 */
export function calculateEMA(candles: CandleData[], period: number): LinePoint[] {
  if (!candles || candles.length === 0) return [];
  if (candles.length < period) return [];

  const k = 2 / (period + 1);
  const result: LinePoint[] = [];

  let currentEma = candles[0].close;

  for (let i = 0; i < candles.length; i++) {
    const close = candles[i].close;
    if (i === 0) {
      currentEma = close;
    } else {
      currentEma = close * k + currentEma * (1 - k);
    }

    if (i >= period - 1) {
      result.push({
        time: candles[i].time as Time,
        value: Number(currentEma.toFixed(4)),
      });
    }
  }

  return result;
}

/**
 * Calculates Bollinger Bands (20, 2)
 */
export function calculateBollingerBands(
  candles: CandleData[],
  period = 20,
  stdMultiplier = 2.0
): BollingerBandsResult {
  const upper: LinePoint[] = [];
  const middle: LinePoint[] = [];
  const lower: LinePoint[] = [];

  if (!candles || candles.length < period) {
    return { upper, middle, lower };
  }

  for (let i = period - 1; i < candles.length; i++) {
    const windowSlice = candles.slice(i - period + 1, i + 1);
    const sum = windowSlice.reduce((acc, c) => acc + c.close, 0);
    const sma = sum / period;

    const variance =
      windowSlice.reduce((acc, c) => acc + Math.pow(c.close - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const time = candles[i].time as Time;
    const upVal = sma + stdMultiplier * stdDev;
    const lowVal = sma - stdMultiplier * stdDev;

    middle.push({ time, value: Number(sma.toFixed(4)) });
    upper.push({ time, value: Number(upVal.toFixed(4)) });
    lower.push({ time, value: Number(lowVal.toFixed(4)) });
  }

  return { upper, middle, lower };
}

/**
 * Calculates Relative Strength Index (RSI)
 */
export function calculateRSI(candles: CandleData[], period = 14): LinePoint[] {
  const result: LinePoint[] = [];
  if (!candles || candles.length <= period) return result;

  let gains = 0;
  let losses = 0;

  // First Average Gain/Loss
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change >= 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Initial RSI
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

  result.push({
    time: candles[period].time as Time,
    value: Number(rsi.toFixed(2))
  });

  // Smoothed Moving Average
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

    result.push({
      time: candles[i].time as Time,
      value: Number(rsi.toFixed(2))
    });
  }

  return result;
}

export interface MACDResult {
  macdLine: LinePoint[];
  signalLine: LinePoint[];
  histogram: LinePoint[];
}

/**
 * Calculates MACD (Moving Average Convergence Divergence)
 */
export function calculateMACD(candles: CandleData[], fast = 12, slow = 26, signal = 9): MACDResult {
  const macdLine: LinePoint[] = [];
  const signalLine: LinePoint[] = [];
  const histogram: LinePoint[] = [];

  if (!candles || candles.length < slow + signal) {
    return { macdLine, signalLine, histogram };
  }

  const fastEma = calculateEMA(candles, fast);
  const slowEma = calculateEMA(candles, slow);

  // Align EMAs
  const fastMap = new Map(fastEma.map(p => [p.time.toString(), p.value]));
  
  const macdValues: LinePoint[] = [];
  for (const p of slowEma) {
    const fVal = fastMap.get(p.time.toString());
    if (fVal !== undefined) {
      macdValues.push({
        time: p.time,
        value: fVal - p.value
      });
    }
  }

  // To calculate EMA of MACD, we need it in CandleData format
  const macdCandles: CandleData[] = macdValues.map(p => ({
    time: p.time as number,
    open: p.value,
    high: p.value,
    low: p.value,
    close: p.value,
    volume: 0
  }));

  const sigEma = calculateEMA(macdCandles, signal);
  const sigMap = new Map(sigEma.map(p => [p.time.toString(), p.value]));

  for (const p of macdValues) {
    macdLine.push({ time: p.time, value: Number(p.value.toFixed(4)) });
    const sVal = sigMap.get(p.time.toString());
    if (sVal !== undefined) {
      signalLine.push({ time: p.time, value: Number(sVal.toFixed(4)) });
      histogram.push({ time: p.time, value: Number((p.value - sVal).toFixed(4)) });
    }
  }

  return { macdLine, signalLine, histogram };
}

/**
 * Calculates Volume Weighted Average Price (VWAP)
 */
export function calculateVWAP(candles: CandleData[]): LinePoint[] {
  if (!candles || candles.length === 0) return [];
  const result: LinePoint[] = [];
  let cumulativeTypicalVolume = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1;
    cumulativeTypicalVolume += typicalPrice * vol;
    cumulativeVolume += vol;

    const vwap = cumulativeTypicalVolume / cumulativeVolume;
    result.push({
      time: c.time as Time,
      value: Number(vwap.toFixed(4)),
    });
  }

  return result;
}

export interface ChartSignalMarker {
  time: Time;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown";
  text: string;
}

/**
 * Generates technical BUY/SELL markers for candlestick charts
 */
export function calculateSignalMarkers(candles: CandleData[]): ChartSignalMarker[] {
  if (!candles || candles.length < 30) return [];
  const markers: ChartSignalMarker[] = [];
  const ema20 = calculateEMA(candles, 20);
  const ema50 = calculateEMA(candles, 50);
  const rsi = calculateRSI(candles, 14);

  const ema20Map = new Map(ema20.map((p) => [p.time.toString(), p.value]));
  const ema50Map = new Map(ema50.map((p) => [p.time.toString(), p.value]));
  const rsiMap = new Map(rsi.map((p) => [p.time.toString(), p.value]));

  let lastSignalIndex = -10;
  for (let i = 1; i < candles.length; i++) {
    const timeStr = candles[i].time.toString();
    const prevTimeStr = candles[i - 1].time.toString();

    const e20 = ema20Map.get(timeStr);
    const e50 = ema50Map.get(timeStr);
    const prevE20 = ema20Map.get(prevTimeStr);
    const prevE50 = ema50Map.get(prevTimeStr);
    const r = rsiMap.get(timeStr);

    if (e20 && e50 && prevE20 && prevE50 && i - lastSignalIndex >= 8) {
      // Golden Cross (EMA20 > EMA50) + not overbought
      if (prevE20 <= prevE50 && e20 > e50 && (!r || r < 70)) {
        markers.push({
          time: candles[i].time as Time,
          position: "belowBar",
          color: "#00e676",
          shape: "arrowUp",
          text: "AL",
        });
        lastSignalIndex = i;
      }
      // Death Cross (EMA20 < EMA50) + not oversold
      else if (prevE20 >= prevE50 && e20 < e50 && (!r || r > 30)) {
        markers.push({
          time: candles[i].time as Time,
          position: "aboveBar",
          color: "#ef5350",
          shape: "arrowDown",
          text: "SAT",
        });
        lastSignalIndex = i;
      }
    }
  }

  return markers;
}
