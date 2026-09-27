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
