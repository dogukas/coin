"use client";

// Main Dashboard Page
// Orchestrates WebSocket lifecycle, renders coin browser + chart + signal card + indicators

import { useEffect, useRef, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { useDashboardStore } from "@/lib/store";
import { WSManager } from "@/lib/utils";
import type { WSMessage } from "@/lib/utils";
import SignalCard from "@/components/dashboard/SignalCard";
import IndicatorGrid from "@/components/dashboard/IndicatorGrid";
import CoinBrowser from "@/components/dashboard/CoinBrowser";
import LiveTrades from "@/components/dashboard/LiveTrades";
import Link from "next/link";
import { toast } from "sonner";
import {
  Wifi,
  WifiOff,
  Activity,
  Clock,
  PanelLeftClose,
  PanelLeft,
  LayoutGrid,
  Map,
  Target,
  Home,
  BarChart3,
  Fish
} from "lucide-react";

import GlobalMarketPanel from "@/components/dashboard/GlobalMarketPanel";
import AiCopilot from "@/components/dashboard/AiCopilot";

// Dynamic import for chart (no SSR — requires browser APIs)
const CandlestickChart = dynamic(
  () => import("@/components/charts/CandlestickChart"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Activity className="w-8 h-8 text-gray-600 animate-pulse" />
          <span className="text-sm text-gray-600">Grafik yükleniyor...</span>
        </div>
      </div>
    ),
  }
);

const DepthChart = dynamic(
  () => import("@/components/charts/DepthChart"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[400px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Activity className="w-8 h-8 text-emerald-600 animate-pulse" />
          <span className="text-sm text-emerald-600">Derinlik yükleniyor...</span>
        </div>
      </div>
    ),
  }
);

export default function DashboardPage() {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const activeInterval = useDashboardStore((s) => s.activeInterval);
  const setInterval = useDashboardStore((s) => s.setInterval);
  const wsConnected = useDashboardStore((s) => s.wsConnected);
  const setConnected = useDashboardStore((s) => s.setConnected);
  const setCandles = useDashboardStore((s) => s.setCandles);
  const updateCandle = useDashboardStore((s) => s.updateCandle);
  const updateSignal = useDashboardStore((s) => s.updateSignal);
  const addTrade = useDashboardStore((s) => s.addTrade);

  // Sidebar state — persisted in localStorage (read after mount to avoid hydration mismatch)
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [chartTab, setChartTab] = useState<"price" | "depth">("price");

  const wsManagerRef = useRef<WSManager | null>(null);

  // Whale alert threshold — persisted in localStorage
  const [whaleThreshold, setWhaleThreshold] = useState(100000);

  // Read persisted values AFTER mount (avoids SSR hydration mismatch)
  useEffect(() => {
    setMounted(true);
    const savedSidebar = localStorage.getItem("sidebar-open");
    if (savedSidebar !== null) setSidebarOpen(savedSidebar === "true");
    const savedWhale = localStorage.getItem("whale-threshold");
    if (savedWhale !== null) setWhaleThreshold(Number(savedWhale));
  }, []);

  // Persist sidebar state
  useEffect(() => {
    if (mounted) localStorage.setItem("sidebar-open", String(sidebarOpen));
  }, [sidebarOpen, mounted]);

  // Persist whale threshold
  useEffect(() => {
    if (mounted) localStorage.setItem("whale-threshold", String(whaleThreshold));
  }, [whaleThreshold, mounted]);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback(
    (data: WSMessage) => {
      switch (data.type) {
        case "history":
          setCandles(data.candles);
          break;
        case "signal":
          updateSignal(data.signal);
          break;
        case "market_update":
          updateSignal(data.signal);
          if (data.candle) {
            updateCandle(data.candle);
          }
          break;
        case "trade_update":
          addTrade(data.trade);
          
          // Whale Alert Check
          if (data.trade) {
            const usdVal = data.trade.price * data.trade.quantity;
            if (usdVal >= whaleThreshold) {
              const title = data.trade.is_buyer_maker ? "🐋 DEV SATIŞ" : "🐳 DEV ALIM";
              const msg = `${activeSymbol.replace("USDT", "")} paritesinde tek kalemde $${usdVal.toLocaleString("en-US", {maximumFractionDigits:0})} işlem yapıldı!`;
              
              if (data.trade.is_buyer_maker) {
                toast.error(title, { description: msg, duration: 4000 });
              } else {
                toast.success(title, { description: msg, duration: 4000 });
              }
            }
          }
          break;
        case "alert":
          if (data.alert) {
            if (data.alert.level === "success") {
              toast.success(data.alert.title, { description: data.alert.message, duration: 5000 });
            } else if (data.alert.level === "error") {
              toast.error(data.alert.title, { description: data.alert.message, duration: 5000 });
            } else {
              toast(data.alert.title, { description: data.alert.message, duration: 5000 });
            }
          }
          break;
      }
    },
    [setCandles, updateCandle, updateSignal, addTrade, whaleThreshold, activeSymbol]
  );

  // Handle connection status changes
  const handleStatusChange = useCallback(
    (connected: boolean) => {
      setConnected(connected);
    },
    [setConnected]
  );

  // WebSocket lifecycle — connect on mount / symbol change, cleanup on unmount
  useEffect(() => {
    // Disconnect previous
    if (wsManagerRef.current) {
      wsManagerRef.current.disconnect();
    }

    // Connect to new symbol & interval
    const manager = new WSManager(
      activeSymbol,
      activeInterval,
      handleMessage,
      handleStatusChange
    );
    wsManagerRef.current = manager;
    manager.connect();

    return () => {
      manager.disconnect();
    };
  }, [activeSymbol, activeInterval, handleMessage, handleStatusChange]);

  return (
    <div className="min-h-screen flex flex-col bg-[#020205] text-white selection:bg-emerald-500/30">
      {/* ── Top Bar (Glassmorphism) ── */}
      <header className="flex flex-wrap items-center justify-between px-3 md:px-6 py-3 border-b border-white/5 bg-slate-900/40 backdrop-blur-xl sticky top-0 z-50 gap-3">
        <div className="flex items-center gap-2 md:gap-3">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
            title={sidebarOpen ? "Paneli gizle" : "Paneli göster"}
          >
            {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
          </button>

          <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 border border-white/10">
            <Activity size={16} className="text-white drop-shadow-md md:w-[18px] md:h-[18px]" />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-bold tracking-tight leading-tight">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">Crypto</span>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400">Signal</span>
            </h1>
            <p className="text-[9px] md:text-[10px] text-gray-500 font-medium uppercase tracking-widest hidden sm:block">
              Analiz Motoru
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 md:px-4 py-1 md:py-1.5 rounded-full bg-white/5 border border-white/10 shadow-inner">
            <span className="text-[9px] md:text-[10px] text-gray-400 font-medium uppercase">Aktif</span>
            <span className="text-xs md:text-sm font-black text-white drop-shadow-sm">
              {activeSymbol.replace("USDT", "")}
              <span className="text-gray-500 font-medium text-[10px] md:text-xs ml-0.5">/USDT</span>
            </span>
          </div>

          <Link href="/screener" className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 hover:border-blue-500/40 transition-all font-semibold text-xs shadow-[0_0_15px_rgba(59,130,246,0.1)] hover:shadow-[0_0_20px_rgba(59,130,246,0.2)]">
            <LayoutGrid size={14} />
            Küp Ekranı
          </Link>

          {/* Whale Alert Threshold Dropdown */}
          <div className="hidden sm:flex items-center gap-2 px-2 md:px-3 py-1 md:py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 transition-colors shadow-inner">
            <span className="text-[9px] md:text-[10px] text-gray-400 font-medium">Balina:</span>
            <select
              value={whaleThreshold}
              onChange={(e) => setWhaleThreshold(Number(e.target.value))}
              className="bg-transparent text-[10px] md:text-xs text-white outline-none cursor-pointer font-bold drop-shadow-sm"
            >
              <option value="1000" className="bg-slate-900 text-white">&gt; $1K</option>
              <option value="10000" className="bg-slate-900 text-white">&gt; $10K</option>
              <option value="50000" className="bg-slate-900 text-white">&gt; $50K</option>
              <option value="100000" className="bg-slate-900 text-white">&gt; $100K</option>
              <option value="500000" className="bg-slate-900 text-white">&gt; $500K</option>
              <option value="1000000000" className="bg-slate-900 text-white">Kapat</option>
            </select>
          </div>

          {/* Live clock */}
          <LiveClock />

          {/* Connection status */}
          <div className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 md:py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
            {wsConnected ? (
              <>
                <div className="relative">
                  <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500" />
                  <div className="absolute inset-0 w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500 animate-pulse-dot" />
                </div>
                <span className="text-[9px] md:text-[10px] text-emerald-400 font-medium">
                  CANLI
                </span>
                <Wifi size={10} className="text-emerald-500 hidden sm:block" />
              </>
            ) : (
              <>
                <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-red-500" />
                <span className="text-[9px] md:text-[10px] text-red-400 font-medium whitespace-nowrap">
                  BAĞ YOK
                </span>
                <WifiOff size={10} className="text-red-500 hidden sm:block" />
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Content (Responsive Flex) ── */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        {/* Left: Coin Browser Sidebar */}
        <div
          className={`
            border-b lg:border-b-0 lg:border-r border-white/5 bg-white/[0.005] flex-shrink-0
            transition-all duration-300 overflow-hidden
            ${sidebarOpen ? "h-[300px] lg:h-full lg:w-[280px]" : "h-0 lg:h-full lg:w-0"}
          `}
        >
          {sidebarOpen && (
            <div className="w-full lg:w-[280px] h-full">
              <CoinBrowser />
            </div>
          )}
        </div>

        {/* Center: Chart */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex flex-wrap items-center justify-between px-3 md:px-4 py-2.5 border-b border-white/5 gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">
                {activeSymbol.replace("USDT", "")}
              </span>
              <span className="text-[10px] text-gray-500 bg-white/[0.03] px-1.5 py-0.5 rounded">/USDT</span>
              
              <div className="flex bg-white/[0.03] rounded-lg p-0.5 ml-1 md:ml-2 border border-white/5 overflow-x-auto">
                <button
                  onClick={() => setChartTab("price")}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors whitespace-nowrap ${
                    chartTab === "price" ? "bg-blue-500/20 text-blue-400" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  Fiyat
                </button>
                <button
                  onClick={() => setChartTab("depth")}
                  className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors whitespace-nowrap ${
                    chartTab === "depth" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  Derinlik
                </button>
              </div>

              {/* Interval Selector (only show if price tab is active) */}
              {chartTab === "price" && (
                <div className="flex bg-white/[0.03] rounded-lg p-0.5 ml-1 md:ml-2 border border-white/5 overflow-x-auto">
                  {["1m", "5m", "15m", "1h", "4h"].map((int) => (
                    <button
                      key={int}
                      onClick={() => setInterval(int)}
                      className={`px-1.5 md:px-2 py-1 rounded text-[10px] font-semibold transition-colors whitespace-nowrap ${
                        activeInterval === int
                          ? "bg-white/[0.08] text-white"
                          : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.05]"
                      }`}
                    >
                      {int}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
              <span className="text-[9px] md:text-[10px] text-gray-500 hidden sm:block">TradingView Charts</span>
            </div>
          </div>
          <div className="w-full h-[350px] md:h-[400px] lg:h-[500px] lg:flex-none">
            {chartTab === "price" ? <CandlestickChart /> : <DepthChart />}
          </div>
          <GlobalMarketPanel />
        </div>

        {/* Right: Signal + Indicators + Trades */}
        <div className="w-full lg:w-[340px] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-white/5 flex flex-col p-3 gap-3">
          <div className="flex-1 lg:overflow-y-auto custom-scrollbar space-y-3">
            <AiCopilot />
            <SignalCard />
            <IndicatorGrid />
            <LiveTrades />
          </div>
        </div>
      </main>

      {/* ── Mobile Bottom Navigation ── */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-xl border-t border-white/10 flex items-center justify-around py-2 px-1 safe-area-bottom">
        <div className="flex flex-col items-center gap-0.5 text-emerald-400">
          <Home size={18} />
          <span className="text-[9px] font-semibold">Ana Sayfa</span>
        </div>
          <Link href="/screener" className="flex flex-col items-center gap-0.5 text-gray-500 hover:text-white transition-colors">
          <LayoutGrid size={18} />
          <span className="text-[9px] font-semibold">Küp Ekran</span>
        </Link>
      </nav>
    </div>
  );
}

// ──────────────────────────────────────────────
// Live Clock Component
// ──────────────────────────────────────────────

function LiveClock() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const update = () => {
      if (ref.current) {
        ref.current.textContent = new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
      <Clock size={11} className="text-gray-500" />
      <span ref={ref} className="text-[11px] text-gray-400 font-mono tabular-nums" />
    </div>
  );
}
