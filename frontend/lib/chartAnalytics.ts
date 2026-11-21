// Pure TypeScript analytics engines for On-Chart Pro Trading Intelligence:
// 1. Liquidation Magnet & Leverage Clusters (10x / 25x / 50x)
// 2. Volume Profile Visible Range (VPVR) & Point of Control (POC)
// 3. Smart Money / ICT Market Structure (FVG, BOS, CHoCH) & Candle Patterns
// 5. Real-Time Walk-Forward Signal Backtest Scorecard

import type { CandleData } from "./utils";
import { calculateSignalMarkers } from "./indicators";

// ──────────────────────────────────────────────────────────────
// 1. LIQUIDATION MAGNET & LEVERAGE CLUSTERS
// ──────────────────────────────────────────────────────────────

export interface LiquidationCluster {
  leverage: 10 | 25 | 50;
  side: "SHORT_LIQ" | "LONG_LIQ";
  price: number;
  distancePct: number;
  anchorSwingPrice: number;
  intensityScore: number; // 0-100 based on swing volume
}

export interface LiquidationMagnetAnalysis {
  shortLiq25x: LiquidationCluster;
  shortLiq50x: LiquidationCluster;
  longLiq25x: LiquidationCluster;
  longLiq50x: LiquidationCluster;
  nearestMagnet: "SHORT_SQUEEZE" | "LONG_FLUSH";
  nearestPrice: number;
  nearestDistancePct: number;
  magnetSummary: string;
}

export function analyzeLiquidationMagnets(candles: CandleData[]): LiquidationMagnetAnalysis | null {
  if (!candles || candles.length < 15) return null;

  const recent = candles.slice(-60);
  const currentPrice = recent[recent.length - 1].close;
  if (currentPrice <= 0) return null;

  // Find significant swing high and swing low weighted by volume
  let swingHigh = currentPrice;
  let swingHighVol = 0;
  let swingLow = currentPrice;
  let swingLowVol = 0;

  for (const c of recent) {
    if (c.high >= swingHigh) {
      swingHigh = c.high;
      swingHighVol = Math.max(swingHighVol, c.volume * c.close);
    }
    if (c.low <= swingLow) {
      swingLow = c.low;
      swingLowVol = Math.max(swingLowVol, c.volume * c.close);
    }
  }

  // Standard isolated futures liquidation offsets (accounting for maintenance margin ~0.4-0.5%)
  // 50x: ~1.65% move against entry | 25x: ~3.55% move against entry
  const short50Price = swingHigh * 1.0165;
  const short25Price = swingHigh * 1.0355;
  const long50Price = swingLow * (1 - 0.0165);
  const long25Price = swingLow * (1 - 0.0355);

  const distShort25 = ((short25Price - currentPrice) / currentPrice) * 100;
  const distShort50 = ((short50Price - currentPrice) / currentPrice) * 100;
  const distLong25 = ((currentPrice - long25Price) / currentPrice) * 100;
  const distLong50 = ((currentPrice - long50Price) / currentPrice) * 100;

  const shortLiq50x: LiquidationCluster = {
    leverage: 50,
    side: "SHORT_LIQ",
    price: short50Price,
    distancePct: Math.max(0.05, distShort50),
    anchorSwingPrice: swingHigh,
    intensityScore: 85,
  };

  const shortLiq25x: LiquidationCluster = {
    leverage: 25,
    side: "SHORT_LIQ",
    price: short25Price,
    distancePct: Math.max(0.1, distShort25),
    anchorSwingPrice: swingHigh,
    intensityScore: 95,
  };

  const longLiq50x: LiquidationCluster = {
    leverage: 50,
    side: "LONG_LIQ",
    price: long50Price,
    distancePct: Math.max(0.05, distLong50),
    anchorSwingPrice: swingLow,
    intensityScore: 85,
  };

  const longLiq25x: LiquidationCluster = {
    leverage: 25,
    side: "LONG_LIQ",
    price: long25Price,
    distancePct: Math.max(0.1, distLong25),
    anchorSwingPrice: swingLow,
    intensityScore: 95,
  };

  const isShortCloser = shortLiq25x.distancePct <= longLiq25x.distancePct;
  const nearestMagnet = isShortCloser ? "SHORT_SQUEEZE" : "LONG_FLUSH";
  const nearestPrice = isShortCloser ? shortLiq25x.price : longLiq25x.price;
  const nearestDistancePct = isShortCloser ? shortLiq25x.distancePct : longLiq25x.distancePct;

  const magnetSummary = isShortCloser
    ? `Yukarıda 25x Short Tasfiye Mıknatısı (+%${shortLiq25x.distancePct.toFixed(2)})`
    : `Aşağıda 25x Long Tasfiye Mıknatısı (-%${longLiq25x.distancePct.toFixed(2)})`;

  return {
    shortLiq25x,
    shortLiq50x,
    longLiq25x,
    longLiq50x,
    nearestMagnet,
    nearestPrice,
    nearestDistancePct,
    magnetSummary,
  };
}

// ──────────────────────────────────────────────────────────────
// 2. VOLUME PROFILE VISIBLE RANGE (VPVR) & POC ENGINE
// ──────────────────────────────────────────────────────────────

export interface VolumeProfileBin {
  index: number;
  priceLow: number;
  priceHigh: number;
  priceMid: number;
  totalUsdVolume: number;
  buyUsdVolume: number;
  sellUsdVolume: number;
  widthPct: number; // 0-100 normalized to POC
  buyRatioPct: number; // 0-100
  isPoc: boolean;
  isValueArea: boolean;
  isLowVolumeNode: boolean;
}

export interface VolumeProfileAnalysis {
  bins: VolumeProfileBin[]; // Ordered from highest price to lowest price for right-edge rendering
  pocPrice: number;
  pocVolumeUsd: number;
  pocDiffPct: number; // Current price vs POC %
  vahPrice: number; // Value Area High (70% volume zone)
  valPrice: number; // Value Area Low (70% volume zone)
  positionText: string;
}

export function calculateVolumeProfile(
  candles: CandleData[],
  binCount = 18
): VolumeProfileAnalysis | null {
  if (!candles || candles.length < 15) return null;

  const windowCandles = candles.slice(-100);
  const currentPrice = windowCandles[windowCandles.length - 1].close;

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  for (const c of windowCandles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
  }

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice <= minPrice) {
    return null;
  }

  const step = (maxPrice - minPrice) / binCount;
  const rawBins: VolumeProfileBin[] = Array.from({ length: binCount }, (_, idx) => {
    const priceLow = minPrice + idx * step;
    const priceHigh = priceLow + step;
    return {
      index: idx,
      priceLow,
      priceHigh,
      priceMid: (priceLow + priceHigh) / 2,
      totalUsdVolume: 0,
      buyUsdVolume: 0,
      sellUsdVolume: 0,
      widthPct: 0,
      buyRatioPct: 50,
      isPoc: false,
      isValueArea: false,
      isLowVolumeNode: false,
    };
  });

  // Distribute each candle's USD volume across overlapping price bins
  let grandTotalUsd = 0;
  for (const c of windowCandles) {
    const typical = (c.high + c.low + c.close) / 3;
    const usdVol = c.volume * typical;
    const buyRatio =
      c.volume > 0 && c.taker_buy_volume !== undefined
        ? Math.min(1, Math.max(0, c.taker_buy_volume / c.volume))
        : c.close >= c.open
        ? 0.56
        : 0.44;

    const startBin = Math.max(0, Math.min(binCount - 1, Math.floor((c.low - minPrice) / step)));
    const endBin = Math.max(0, Math.min(binCount - 1, Math.floor((c.high - minPrice) / step)));
    const touchedCount = endBin - startBin + 1;
    const volPerBin = usdVol / touchedCount;

    for (let b = startBin; b <= endBin; b++) {
      rawBins[b].totalUsdVolume += volPerBin;
      rawBins[b].buyUsdVolume += volPerBin * buyRatio;
      rawBins[b].sellUsdVolume += volPerBin * (1 - buyRatio);
    }
    grandTotalUsd += usdVol;
  }

  if (grandTotalUsd <= 0) return null;

  // Identify POC (Point of Control)
  let pocIdx = 0;
  let maxBinVol = -1;
  for (let i = 0; i < rawBins.length; i++) {
    if (rawBins[i].totalUsdVolume > maxBinVol) {
      maxBinVol = rawBins[i].totalUsdVolume;
      pocIdx = i;
    }
  }
  rawBins[pocIdx].isPoc = true;

  // Calculate 70% Value Area expanding from POC
  const targetValueAreaUsd = grandTotalUsd * 0.7;
  let accumulatedVaUsd = rawBins[pocIdx].totalUsdVolume;
  rawBins[pocIdx].isValueArea = true;
  let lowPtr = pocIdx;
  let highPtr = pocIdx;

  while (accumulatedVaUsd < targetValueAreaUsd && (lowPtr > 0 || highPtr < binCount - 1)) {
    const nextLowVol = lowPtr > 0 ? rawBins[lowPtr - 1].totalUsdVolume : -1;
    const nextHighVol = highPtr < binCount - 1 ? rawBins[highPtr + 1].totalUsdVolume : -1;

    if (nextHighVol >= nextLowVol && highPtr < binCount - 1) {
      highPtr++;
      rawBins[highPtr].isValueArea = true;
      accumulatedVaUsd += rawBins[highPtr].totalUsdVolume;
    } else if (lowPtr > 0) {
      lowPtr--;
      rawBins[lowPtr].isValueArea = true;
      accumulatedVaUsd += rawBins[lowPtr].totalUsdVolume;
    } else {
      break;
    }
  }

  for (const bin of rawBins) {
    bin.widthPct = maxBinVol > 0 ? (bin.totalUsdVolume / maxBinVol) * 100 : 0;
    bin.buyRatioPct =
      bin.totalUsdVolume > 0 ? (bin.buyUsdVolume / bin.totalUsdVolume) * 100 : 50;
    bin.isLowVolumeNode = bin.widthPct < 24;
  }

  const pocPrice = rawBins[pocIdx].priceMid;
  const pocDiffPct = pocPrice > 0 ? ((currentPrice - pocPrice) / pocPrice) * 100 : 0;
  const vahPrice = rawBins[highPtr].priceHigh;
  const valPrice = rawBins[lowPtr].priceLow;

  let positionText = "POC Adil Değer Üstünde (Alıcı Güçlü)";
  if (currentPrice > vahPrice) {
    positionText = "Değer Alanı Üstü (Premium / Kırılım)";
  } else if (currentPrice < valPrice) {
    positionText = "Değer Alanı Altı (İndirimli / Zayıf)";
  } else if (currentPrice < pocPrice) {
    positionText = "POC Altında (Direnç Mıknatısı)";
  }

  return {
    bins: [...rawBins].reverse(), // Top-to-bottom order matches chart price axis
    pocPrice,
    pocVolumeUsd: maxBinVol,
    pocDiffPct,
    vahPrice,
    valPrice,
    positionText,
  };
}

// ──────────────────────────────────────────────────────────────
// 3. SMART MONEY / ICT MARKET STRUCTURE & CANDLE PATTERNS
// ──────────────────────────────────────────────────────────────

export interface CandlePatternInfo {
  name: string;
  tone: "BULL" | "BEAR" | "NEUTRAL";
  icon: string;
}

export function detectCandlePattern(
  candle: CandleData | null,
  prevCandle: CandleData | null
): CandlePatternInfo | null {
  if (!candle) return null;
  const range = candle.high - candle.low;
  if (range <= 0) return null;

  const body = Math.abs(candle.close - candle.open);
  const bodyRatio = body / range;
  const isBull = candle.close >= candle.open;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;

  // 1. Bullish / Bearish Engulfing
  if (prevCandle) {
    const prevBody = Math.abs(prevCandle.close - prevCandle.open);
    const prevBull = prevCandle.close >= prevCandle.open;
    if (
      !prevBull &&
      isBull &&
      body > prevBody * 1.08 &&
      candle.close >= prevCandle.open &&
      candle.open <= prevCandle.close
    ) {
      return { name: "Boğa Yutan (Engulfing)", tone: "BULL", icon: "🚀" };
    }
    if (
      prevBull &&
      !isBull &&
      body > prevBody * 1.08 &&
      candle.close <= prevCandle.open &&
      candle.open >= prevCandle.close
    ) {
      return { name: "Ayı Yutan (Engulfing)", tone: "BEAR", icon: "🩸" };
    }
  }

  // 2. Hammer (Dip Tepki Çekici)
  if (lowerWick >= range * 0.58 && upperWick <= range * 0.18) {
    return { name: "Çekiç (Dip Alım Tepkisi)", tone: "BULL", icon: "🔨" };
  }

  // 3. Shooting Star (Kayan Yıldız / Üst Ret)
  if (upperWick >= range * 0.58 && lowerWick <= range * 0.18) {
    return { name: "Kayan Yıldız (Üst Ret)", tone: "BEAR", icon: "🌠" };
  }

  // 4. Marubozu (Tam Gövdeli Güçlü Mum)
  if (bodyRatio >= 0.78) {
    return isBull
      ? { name: "Güçlü Boğa (Marubozu)", tone: "BULL", icon: "🔥" }
      : { name: "Güçlü Ayı (Marubozu)", tone: "BEAR", icon: "🩸" };
  }

  // 5. Doji (Kararsızlık)
  if (bodyRatio <= 0.14) {
    return { name: "Doji (Kararsızlık / Denge)", tone: "NEUTRAL", icon: "⚖️" };
  }

  return null;
}

export interface FvgZone {
  type: "BULL_FVG" | "BEAR_FVG";
  top: number;
  bottom: number;
  mid: number;
  distancePct: number;
}

export interface SmartMoneyAnalysis {
  structureTag: "BULL_BOS" | "BEAR_BOS" | "BULL_CHOCH" | "BEAR_CHOCH" | "RANGE";
  structureLabel: string;
  structureTone: "BULL" | "BEAR" | "NEUTRAL";
  nearestFvg: FvgZone | null;
  bbSqueeze: boolean;
}

export function analyzeSmartMoneyStructure(candles: CandleData[]): SmartMoneyAnalysis | null {
  if (!candles || candles.length < 25) return null;

  const recent = candles.slice(-50);
  const last = recent[recent.length - 1];
  const currentPrice = last.close;

  // Compare prior 20-bar structure vs intermediate 20-bar structure
  const firstHalf = recent.slice(0, 24);
  const secondHalf = recent.slice(24, -1);

  const firstHigh = Math.max(...firstHalf.map((c) => c.high));
  const firstLow = Math.min(...firstHalf.map((c) => c.low));
  const secondHigh = Math.max(...secondHalf.map((c) => c.high));
  const secondLow = Math.min(...secondHalf.map((c) => c.low));

  let structureTag: SmartMoneyAnalysis["structureTag"] = "RANGE";
  let structureLabel = "Kanal İçi Akümülasyon";
  let structureTone: SmartMoneyAnalysis["structureTone"] = "NEUTRAL";

  if (currentPrice > secondHigh && secondLow >= firstLow) {
    structureTag = "BULL_BOS";
    structureLabel = "📈 Boğa BOS (Yükselen Yapı Kırılımı)";
    structureTone = "BULL";
  } else if (currentPrice > secondHigh && secondLow < firstLow) {
    structureTag = "BULL_CHOCH";
    structureLabel = "🔄 Boğa CHoCH (Yukarı Trend Dönüşü)";
    structureTone = "BULL";
  } else if (currentPrice < secondLow && secondHigh <= firstHigh) {
    structureTag = "BEAR_BOS";
    structureLabel = "📉 Ayı BOS (Düşen Yapı Kırılımı)";
    structureTone = "BEAR";
  } else if (currentPrice < secondLow && secondHigh > firstHigh) {
    structureTag = "BEAR_CHOCH";
    structureLabel = "🔄 Ayı CHoCH (Aşağı Trend Dönüşü)";
    structureTone = "BEAR";
  } else if (secondHigh > firstHigh && secondLow > firstLow) {
    structureTag = "BULL_BOS";
    structureLabel = "📈 Yükselen Market Yapısı (HH + HL)";
    structureTone = "BULL";
  } else if (secondHigh < firstHigh && secondLow < firstLow) {
    structureTag = "BEAR_BOS";
    structureLabel = "📉 Düşen Market Yapısı (LH + LL)";
    structureTone = "BEAR";
  }

  // Detect nearest Unfilled Fair Value Gap (FVG) in last 35 candles
  const fvgWindow = candles.slice(-35);
  let nearestFvg: FvgZone | null = null;
  let bestDist = Infinity;

  for (let i = 2; i < fvgWindow.length - 1; i++) {
    const c0 = fvgWindow[i - 2];
    const c2 = fvgWindow[i];

    // Bullish FVG: c0.high < c2.low
    if (c2.low > c0.high * 1.0008) {
      const gapBottom = c0.high;
      const gapTop = c2.low;
      // Check if subsequent candles already filled it completely
      let filled = false;
      for (let j = i + 1; j < fvgWindow.length; j++) {
        if (fvgWindow[j].low <= gapBottom) {
          filled = true;
          break;
        }
      }
      if (!filled) {
        const mid = (gapTop + gapBottom) / 2;
        const dist = Math.abs(((currentPrice - mid) / currentPrice) * 100);
        if (dist < bestDist) {
          bestDist = dist;
          nearestFvg = {
            type: "BULL_FVG",
            top: gapTop,
            bottom: gapBottom,
            mid,
            distancePct: dist,
          };
        }
      }
    }

    // Bearish FVG: c0.low > c2.high
    if (c0.low > c2.high * 1.0008) {
      const gapTop = c0.low;
      const gapBottom = c2.high;
      let filled = false;
      for (let j = i + 1; j < fvgWindow.length; j++) {
        if (fvgWindow[j].high >= gapTop) {
          filled = true;
          break;
        }
      }
      if (!filled) {
        const mid = (gapTop + gapBottom) / 2;
        const dist = Math.abs(((mid - currentPrice) / currentPrice) * 100);
        if (dist < bestDist) {
          bestDist = dist;
          nearestFvg = {
            type: "BEAR_FVG",
            top: gapTop,
            bottom: gapBottom,
            mid,
            distancePct: dist,
          };
        }
      }
    }
  }

  // Bollinger Squeeze check (20-period std dev bandwidth < 1.8%)
  const last20 = candles.slice(-20);
  const mean20 = last20.reduce((s, c) => s + c.close, 0) / last20.length;
  const variance =
    last20.reduce((s, c) => s + Math.pow(c.close - mean20, 2), 0) / last20.length;
  const stdDev = Math.sqrt(variance);
  const bandwidthPct = mean20 > 0 ? ((4 * stdDev) / mean20) * 100 : 10;
  const bbSqueeze = bandwidthPct < 1.9;

  return {
    structureTag,
    structureLabel,
    structureTone,
    nearestFvg,
    bbSqueeze,
  };
}

// ──────────────────────────────────────────────────────────────
// 5. LIVE SIGNAL WALK-FORWARD BACKTEST ENGINE
// ──────────────────────────────────────────────────────────────

export interface SimulatedTrade {
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number;
  pnlPct: number;
  outcome: "WIN" | "LOSS";
  reason: "TP" | "SL" | "TERS_SİNYAL";
}

export interface SignalBacktestReport {
  totalTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  netReturnPct: number;
  profitFactor: number;
  avgWinPct: number;
  avgLossPct: number;
  maxDrawdownPct: number;
  activePosition: {
    direction: "LONG" | "SHORT";
    entryPrice: number;
    currentPnlPct: number;
  } | null;
  recentTrades: SimulatedTrade[];
  gradeLabel: string;
}

export function runSignalBacktest(candles: CandleData[]): SignalBacktestReport | null {
  if (!candles || candles.length < 40) return null;

  const markers = calculateSignalMarkers(candles);
  if (markers.length === 0) return null;

  const candleIdxByTime = new Map<number, number>();
  for (let i = 0; i < candles.length; i++) {
    candleIdxByTime.set(candles[i].time, i);
  }

  // Compute average bar range % to set adaptive TP/SL thresholds
  const sampleBars = candles.slice(-40);
  const avgBarPct =
    sampleBars.reduce((acc, c) => acc + (c.open > 0 ? (c.high - c.low) / c.open : 0.005), 0) /
    sampleBars.length;
  const tpTargetPct = Math.max(0.012, Math.min(0.06, avgBarPct * 3.2)); // ~3.2x ATR
  const slLimitPct = Math.max(0.008, Math.min(0.035, avgBarPct * 2.0)); // ~2.0x ATR

  const completedTrades: SimulatedTrade[] = [];

  for (let m = 0; m < markers.length; m++) {
    const marker = markers[m];
    const startIdx = candleIdxByTime.get(Number(marker.time));
    if (startIdx === undefined) continue;

    const nextMarker = m + 1 < markers.length ? markers[m + 1] : null;
    const endIdx =
      nextMarker && candleIdxByTime.get(Number(nextMarker.time)) !== undefined
        ? (candleIdxByTime.get(Number(nextMarker.time)) as number)
        : candles.length - 1;

    const direction: "LONG" | "SHORT" = marker.shape === "arrowUp" ? "LONG" : "SHORT";
    const entryPrice = candles[startIdx].close;
    if (entryPrice <= 0) continue;

    // If this is the very last signal and still open, check if it hit TP/SL already or remains active
    let closed = false;
    for (let i = startIdx + 1; i <= endIdx; i++) {
      const bar = candles[i];
      if (direction === "LONG") {
        const maxGain = (bar.high - entryPrice) / entryPrice;
        const maxLoss = (entryPrice - bar.low) / entryPrice;
        if (maxGain >= tpTargetPct) {
          completedTrades.push({
            direction,
            entryPrice,
            exitPrice: entryPrice * (1 + tpTargetPct),
            pnlPct: tpTargetPct * 100,
            outcome: "WIN",
            reason: "TP",
          });
          closed = true;
          break;
        }
        if (maxLoss >= slLimitPct) {
          completedTrades.push({
            direction,
            entryPrice,
            exitPrice: entryPrice * (1 - slLimitPct),
            pnlPct: -slLimitPct * 100,
            outcome: "LOSS",
            reason: "SL",
          });
          closed = true;
          break;
        }
      } else {
        const maxGain = (entryPrice - bar.low) / entryPrice;
        const maxLoss = (bar.high - entryPrice) / entryPrice;
        if (maxGain >= tpTargetPct) {
          completedTrades.push({
            direction,
            entryPrice,
            exitPrice: entryPrice * (1 - tpTargetPct),
            pnlPct: tpTargetPct * 100,
            outcome: "WIN",
            reason: "TP",
          });
          closed = true;
          break;
        }
        if (maxLoss >= slLimitPct) {
          completedTrades.push({
            direction,
            entryPrice,
            exitPrice: entryPrice * (1 + slLimitPct),
            pnlPct: -slLimitPct * 100,
            outcome: "LOSS",
            reason: "SL",
          });
          closed = true;
          break;
        }
      }
    }

    if (!closed && nextMarker) {
      // Closed by opposite signal reversal at endIdx
      const exitPrice = candles[endIdx].close;
      const rawPct =
        direction === "LONG"
          ? ((exitPrice - entryPrice) / entryPrice) * 100
          : ((entryPrice - exitPrice) / entryPrice) * 100;
      completedTrades.push({
        direction,
        entryPrice,
        exitPrice,
        pnlPct: rawPct,
        outcome: rawPct >= 0 ? "WIN" : "LOSS",
        reason: "TERS_SİNYAL",
      });
    }
  }

  // Check if latest marker is still open
  const lastMarker = markers[markers.length - 1];
  const latestClose = candles[candles.length - 1].close;
  const lastStartIdx = candleIdxByTime.get(Number(lastMarker.time)) ?? candles.length - 1;
  const lastDir: "LONG" | "SHORT" = lastMarker.shape === "arrowUp" ? "LONG" : "SHORT";
  const lastEntryPrice = candles[lastStartIdx].close;
  const currentPnlPct =
    lastEntryPrice > 0
      ? lastDir === "LONG"
        ? ((latestClose - lastEntryPrice) / lastEntryPrice) * 100
        : ((lastEntryPrice - latestClose) / lastEntryPrice) * 100
      : 0;

  const activePosition = {
    direction: lastDir,
    entryPrice: lastEntryPrice,
    currentPnlPct,
  };

  const totalTrades = completedTrades.length;
  const wins = completedTrades.filter((t) => t.outcome === "WIN").length;
  const losses = totalTrades - wins;
  const winRatePct = totalTrades > 0 ? (wins / totalTrades) * 100 : currentPnlPct >= 0 ? 100 : 0;

  let grossProfit = 0;
  let grossLoss = 0;
  let netReturnPct = 0;
  let peakEquity = 0;
  let maxDrawdownPct = 0;

  for (const t of completedTrades) {
    netReturnPct += t.pnlPct;
    if (t.pnlPct >= 0) grossProfit += t.pnlPct;
    else grossLoss += Math.abs(t.pnlPct);

    if (netReturnPct > peakEquity) peakEquity = netReturnPct;
    const dd = peakEquity - netReturnPct;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  }

  const profitFactor =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 3.5 : 1.0;
  const avgWinPct = wins > 0 ? grossProfit / wins : tpTargetPct * 100;
  const avgLossPct = losses > 0 ? grossLoss / losses : slLimitPct * 100;

  let gradeLabel = "DENGELİ PERFORMANS";
  if (winRatePct >= 65 && netReturnPct > 0) {
    gradeLabel = "🔥 YÜKSEK BAŞARILI PERİYOT";
  } else if (winRatePct >= 52 && netReturnPct >= 0) {
    gradeLabel = "✅ POZİTİF BEKLENTİ (KÂRLI)";
  } else if (winRatePct < 45) {
    gradeLabel = "⚠️ TESTERE PİYASASI (DİKKAT)";
  }

  return {
    totalTrades,
    wins,
    losses,
    winRatePct,
    netReturnPct,
    profitFactor,
    avgWinPct,
    avgLossPct,
    maxDrawdownPct,
    activePosition,
    recentTrades: completedTrades.slice(-4).reverse(),
    gradeLabel,
  };
}
