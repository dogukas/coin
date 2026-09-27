// TypeScript types and interfaces for the Crypto Signal Dashboard

// ──────────────────────────────────────────────
// Core Data Types (mirror backend Pydantic models)
// ──────────────────────────────────────────────

export interface CandleData {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  taker_buy_volume?: number;
}

export interface IndicatorData {
  rsi: number | null;
  macd_line: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  macd_trend: "bullish" | "bearish" | null;
  ema_20: number | null;
  ema_50: number | null;
  ema_200: number | null;
  ema_trend: "bullish_cross" | "bearish_cross" | "neutral" | null;
  bb_upper: number | null;
  bb_middle: number | null;
  bb_lower: number | null;
  vwap: number | null;
  volume_ma: number | null;
  current_volume: number | null;
  buy_pressure_pct?: number | null;
}

export interface SignalPayload {
  symbol: string;
  price: number;
  score: number; // 0–100
  label: string; // Turkish label
  indicators: IndicatorData;
  reasons: string[];
  timestamp: number;
}

export interface TradeData {
  price: number;
  quantity: number;
  time: number;
  is_buyer_maker: boolean;
}

export interface MarketUpdate {
  type: "market_update";
  signal: SignalPayload;
  candle: CandleData | null;
}

export interface HistoryMessage {
  type: "history";
  candles: CandleData[];
}

export interface SignalMessage {
  type: "signal";
  signal: SignalPayload;
}

export interface TradeUpdateMessage {
  type: "trade_update";
  trade: TradeData;
}

export interface HeartbeatMessage {
  type: "heartbeat";
  ts: number;
}

export interface AlertMessage {
  type: "alert";
  alert: {
    title: string;
    message: string;
    level: "success" | "error" | "info";
    symbol: string;
  };
}

export type WSMessage =
  | MarketUpdate
  | HistoryMessage
  | SignalMessage
  | TradeUpdateMessage
  | HeartbeatMessage
  | AlertMessage;

export interface SymbolInfo {
  symbol: string;
  price: number | null;
  change_24h: number | null;
}

export interface MarketCoin {
  symbol: string;
  price: number;
  change_24h: number;
  volume_usd: number;
  high_24h: number | null;
  low_24h: number | null;
  category: string | null;
  buy_pressure_pct?: number;
}

export interface MarketOverview {
  popular: MarketCoin[];
  gainers: MarketCoin[];
  losers: MarketCoin[];
  total_count: number;
}

export interface TACubeData {
  symbol: string;
  price: number;
  change_24h: number;
  volume_usd: number;
  signal_score: number;
  signal_level: string;
  rsi_14: number | null;
  macd_value: number | null;
  macd_trend: string | null;
  buy_pressure_pct: number;
  sparkline: number[];
}

// ──────────────────────────────────────────────
// Signal label utilities
// ──────────────────────────────────────────────

export type SignalLevel = "strong_buy" | "buy" | "hold" | "sell";

export function getSignalLevel(score: number): SignalLevel {
  if (score >= 76) return "strong_buy";
  if (score >= 56) return "buy";
  if (score >= 36) return "hold";
  return "sell";
}

export function getSignalColor(score: number): string {
  const level = getSignalLevel(score);
  switch (level) {
    case "strong_buy":
      return "#00e676";
    case "buy":
      return "#66bb6a";
    case "hold":
      return "#ffc107";
    case "sell":
      return "#ef5350";
  }
}

export function getSignalGlow(score: number): string {
  const level = getSignalLevel(score);
  switch (level) {
    case "strong_buy":
      return "0 0 40px rgba(0, 230, 118, 0.3)";
    case "buy":
      return "0 0 30px rgba(102, 187, 106, 0.25)";
    case "hold":
      return "0 0 30px rgba(255, 193, 7, 0.2)";
    case "sell":
      return "0 0 30px rgba(239, 83, 80, 0.25)";
  }
}

// ──────────────────────────────────────────────
// Formatting utilities
// ──────────────────────────────────────────────

export function formatPrice(price: number, symbol?: string): string {
  if (price >= 1000) {
    return price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  if (price >= 1) {
    return price.toFixed(4);
  }
  return price.toFixed(6);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function formatVolume(volume: number): string {
  if (volume >= 1_000_000_000) return `${(volume / 1_000_000_000).toFixed(2)}B`;
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(2)}K`;
  return volume.toFixed(2);
}

// ──────────────────────────────────────────────
// WebSocket manager
// ──────────────────────────────────────────────

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const WS_BASE_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export class WSManager {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private pingInterval: NodeJS.Timeout | null = null;
  private symbol: string;
  private interval: string;
  private onMessage: (data: WSMessage) => void;
  private onStatusChange: (connected: boolean) => void;

  constructor(
    symbol: string,
    interval: string,
    onMessage: (data: WSMessage) => void,
    onStatusChange: (connected: boolean) => void
  ) {
    this.symbol = symbol;
    this.interval = interval;
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
  }

  connect() {
    this.cleanup();
    const url = `${WS_BASE_URL}/ws/market/${this.symbol}?interval=${this.interval}`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectDelay = 1000;
        this.onStatusChange(true);
        // Start ping interval
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send("ping");
          }
        }, 25000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WSMessage;
          if (data.type !== "heartbeat") {
            this.onMessage(data);
          }
        } catch {
          // Ignore non-JSON (pong, etc.)
        }
      };

      this.ws.onclose = () => {
        this.onStatusChange(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.onStatusChange(false);
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        this.maxReconnectDelay
      );
      this.connect();
    }, this.reconnectDelay);
  }

  private cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  disconnect() {
    this.cleanup();
    this.onStatusChange(false);
  }
}
