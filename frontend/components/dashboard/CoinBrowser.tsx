"use client";

// CoinBrowser — tabbed market explorer with Popular, Gainers, Losers, and Search
// Fetches all USDT pairs from Binance via backend API

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useDashboardStore } from "@/lib/store";
import { formatPrice, formatPercent, API_URL } from "@/lib/utils";
import type { MarketCoin, MarketOverview } from "@/lib/utils";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Flame,
  ChevronRight,
  Loader2,
  BarChart3,
  RefreshCw,
} from "lucide-react";

type TabKey = "popular" | "gainers" | "losers" | "strong_buys";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "popular", label: "Popüler", icon: <Flame size={13} /> },
  { key: "strong_buys", label: "🔥 Güçlü Alım", icon: <TrendingUp size={13} className="text-emerald-400" /> },
  { key: "gainers", label: "Yükselenler", icon: <TrendingUp size={13} /> },
  { key: "losers", label: "Düşenler", icon: <TrendingDown size={13} /> },
];

export default function CoinBrowser() {
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("popular");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MarketCoin[]>([]);
  const [strongBuys, setStrongBuys] = useState<MarketCoin[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const setSymbol = useDashboardStore((s) => s.setSymbol);

  // Fetch market overview
  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/market/overview?limit=30`);
      if (res.ok) {
        const data: MarketOverview = await res.json();
        setOverview(data);
        setLastUpdated(new Date());
      }
    } catch {
      // Backend not ready
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 1000); // Refresh every 1s
    return () => clearInterval(interval);
  }, [fetchOverview]);

  const fetchStrongBuys = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_URL}/api/market/strong-buys?limit=20`);
      if (res.ok) {
        const data: MarketCoin[] = await res.json();
        setStrongBuys(data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch strong buys when tab is selected
  useEffect(() => {
    if (activeTab === "strong_buys" && strongBuys.length === 0) {
      fetchStrongBuys();
    }
  }, [activeTab, fetchStrongBuys, strongBuys.length]);

  // Search with debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/market/search?q=${encodeURIComponent(searchQuery)}&limit=20`
        );
        if (res.ok) {
          const data: MarketCoin[] = await res.json();
          setSearchResults(data);
        }
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  // Current display list
  const displayCoins = useMemo(() => {
    if (searchQuery.trim()) return searchResults;
    if (activeTab === "strong_buys") return strongBuys;
    if (!overview) return [];
    switch (activeTab) {
      case "popular":
        return overview.popular;
      case "gainers":
        return overview.gainers;
      case "losers":
        return overview.losers;
      default:
        return [];
    }
  }, [searchQuery, searchResults, overview, activeTab, strongBuys]);

  const handleSelectCoin = useCallback(
    (symbol: string) => {
      setSymbol(symbol);
    },
    [setSymbol]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-emerald-400" />
            <span className="text-[11px] font-bold text-white uppercase tracking-wider">
              Piyasa
            </span>
            {overview && (
              <span className="text-[9px] text-gray-500 font-mono">
                {overview.total_count} coin
              </span>
            )}
          </div>
          <button
            onClick={() => {
              setIsLoading(true);
              fetchOverview();
            }}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded-md hover:bg-white/5"
            title="Yenile"
          >
            <RefreshCw
              size={11}
              className={isLoading ? "animate-spin" : ""}
            />
          </button>
        </div>

        {/* Search bar */}
        <div className="relative mb-2.5">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Coin ara... (BTC, DOGE, XRP)"
            className="w-full bg-white/[0.03] border border-white/5 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-gray-600 outline-none focus:border-emerald-500/40 transition-colors"
          />
          {isSearching && (
            <Loader2
              size={12}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 animate-spin"
            />
          )}
        </div>

        {/* Tabs (hidden during search) */}
        {!searchQuery.trim() && (
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold
                  transition-all duration-200 cursor-pointer
                  ${
                    activeTab === tab.key
                      ? "bg-white/[0.08] text-white border border-white/10"
                      : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border border-transparent"
                  }
                `}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Coin list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 pb-2 custom-scrollbar">
        {isLoading && !overview ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={20} className="text-gray-600 animate-spin" />
          </div>
        ) : displayCoins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-600">
            <Search size={20} className="mb-2 opacity-50" />
            <span className="text-[11px]">
              {searchQuery ? "Sonuç bulunamadı" : "Veri yükleniyor..."}
            </span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {displayCoins.map((coin) => (
              <CoinRow
                key={coin.symbol}
                coin={coin}
                isActive={coin.symbol === activeSymbol}
                onClick={handleSelectCoin}
              />
            ))}
          </div>
        )}
      </div>

      {/* Last updated footer */}
      {lastUpdated && (
        <div className="px-3 py-1.5 border-t border-white/5">
          <span className="text-[9px] text-gray-600 font-mono">
            Son: {lastUpdated.toLocaleTimeString("tr-TR")}
          </span>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// CoinRow Component
// ──────────────────────────────────────────────

function CoinRow({
  coin,
  isActive,
  onClick,
}: {
  coin: MarketCoin;
  isActive: boolean;
  onClick: (symbol: string) => void;
}) {
  const baseName = coin.symbol.replace("USDT", "");
  const changeColor = coin.change_24h >= 0 ? "#00e676" : "#ef5350";
  const changeBg = coin.change_24h >= 0 ? "rgba(0, 230, 118, 0.08)" : "rgba(239, 83, 80, 0.08)";

  return (
    <button
      onClick={() => onClick(coin.symbol)}
      className={`
        w-full flex items-center gap-2 px-3 py-2 rounded-xl
        transition-all duration-300 cursor-pointer group relative overflow-hidden
        ${
          isActive
            ? "bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]"
            : "hover:bg-white/5 border border-transparent hover:border-white/10"
        }
      `}
    >
      {/* Active Indicator Line */}
      {isActive && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
      )}
      {/* Coin icon placeholder */}
      <div
        className={`
          w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
          text-[10px] font-bold
          ${isActive ? "bg-emerald-500/20 text-emerald-400" : "bg-white/[0.05] text-gray-400"}
        `}
      >
        {baseName.slice(0, 2)}
      </div>

      {/* Name + Symbol */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[11px] font-bold truncate ${
              isActive ? "text-white" : "text-gray-300 group-hover:text-white"
            }`}
          >
            {baseName}
          </span>
          <span className="text-[9px] text-gray-600">/USDT</span>
        </div>
        <div className="text-[9px] text-gray-600 font-mono tabular-nums">
          Vol: ${formatVolShort(coin.volume_usd)}
          {coin.buy_pressure_pct !== undefined && (
            <span className="ml-1.5 text-emerald-400 font-bold">
              %{coin.buy_pressure_pct} Alış
            </span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="text-right flex-shrink-0">
        <div className="text-[11px] font-bold text-white tabular-nums">
          ${formatPrice(coin.price)}
        </div>
        <div
          className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md inline-block mt-0.5"
          style={{ color: changeColor, backgroundColor: changeBg }}
        >
          {coin.change_24h >= 0 ? "+" : ""}
          {coin.change_24h.toFixed(2)}%
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight
        size={12}
        className={`flex-shrink-0 transition-all duration-200 ${
          isActive
            ? "text-emerald-400"
            : "text-gray-700 group-hover:text-gray-400"
        }`}
      />
    </button>
  );
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function formatVolShort(vol: number): string {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
  return vol.toFixed(0);
}
