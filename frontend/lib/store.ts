// Zustand state management for the crypto dashboard

import { create } from "zustand";
import type { CandleData, SignalPayload, SymbolInfo, TradeData } from "./utils";

// ──────────────────────────────────────────────
// Store Interface
// ──────────────────────────────────────────────

interface DashboardState {
  // Active symbol & interval
  activeSymbol: string;
  activeInterval: string;

  // Connection status
  wsConnected: boolean;

  // Market data
  candles: CandleData[];
  signalData: SignalPayload | null;
  trades: TradeData[];

  // Symbol list with prices
  symbols: SymbolInfo[];

  // Actions
  setSymbol: (symbol: string) => void;
  setInterval: (interval: string) => void;
  setConnected: (connected: boolean) => void;
  setCandles: (candles: CandleData[]) => void;
  updateCandle: (candle: CandleData) => void;
  updateSignal: (signal: SignalPayload) => void;
  addTrade: (trade: TradeData) => void;
  setSymbols: (symbols: SymbolInfo[]) => void;
}

// ──────────────────────────────────────────────
// Store
// ──────────────────────────────────────────────

export const useDashboardStore = create<DashboardState>((set, get) => ({
  // Initial state
  activeSymbol: "BTCUSDT",
  activeInterval: "15m",
  wsConnected: false,
  candles: [],
  signalData: null,
  trades: [],
  symbols: [
    { symbol: "BTCUSDT", price: null, change_24h: null },
    { symbol: "ETHUSDT", price: null, change_24h: null },
    { symbol: "SOLUSDT", price: null, change_24h: null },
  ],

  // Actions
  setSymbol: (symbol: string) =>
    set({
      activeSymbol: symbol,
      candles: [],
      signalData: null,
      trades: [],
      wsConnected: false,
    }),

  setInterval: (interval: string) =>
    set({
      activeInterval: interval,
      candles: [],
      signalData: null,
      trades: [],
      wsConnected: false,
    }),

  setConnected: (connected: boolean) => set({ wsConnected: connected }),

  setCandles: (candles: CandleData[]) => set({ candles }),

  updateCandle: (candle: CandleData) =>
    set((state) => {
      const candles = [...state.candles];
      const lastIdx = candles.length - 1;

      if (lastIdx >= 0 && candles[lastIdx].time === candle.time) {
        // Update existing candle
        candles[lastIdx] = candle;
      } else {
        // Append new candle
        candles.push(candle);
        // Keep bounded
        if (candles.length > 600) {
          return { candles: candles.slice(-500) };
        }
      }
      return { candles };
    }),

  updateSignal: (signal: SignalPayload) =>
    set((state) => {
      // Also update the symbol price in the symbols list
      const symbols = state.symbols.map((s) =>
        s.symbol === signal.symbol ? { ...s, price: signal.price } : s
      );
      return { signalData: signal, symbols };
    }),

  addTrade: (trade: TradeData) =>
    set((state) => {
      const newTrades = [trade, ...state.trades];
      if (newTrades.length > 50) {
        newTrades.length = 50; // Keep only latest 50 trades
      }
      return { trades: newTrades };
    }),

  setSymbols: (symbols: SymbolInfo[]) => set({ symbols }),
}));
