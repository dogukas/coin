"use client";

// Watchlist — horizontal symbol selector with live mini-prices

import { useEffect } from "react";
import { useDashboardStore } from "@/lib/store";
import { formatPrice, formatPercent } from "@/lib/utils";
import type { SymbolInfo } from "@/lib/utils";

// Symbol display configs
const SYMBOL_CONFIG: Record<string, { short: string; icon: string }> = {
  BTCUSDT: { short: "BTC", icon: "₿" },
  ETHUSDT: { short: "ETH", icon: "Ξ" },
  SOLUSDT: { short: "SOL", icon: "◎" },
};

export default function Watchlist() {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const symbols = useDashboardStore((s) => s.symbols);
  const setSymbol = useDashboardStore((s) => s.setSymbol);
  const setSymbols = useDashboardStore((s) => s.setSymbols);

  // Fetch symbol prices on mount
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/symbols");
        if (res.ok) {
          const data: SymbolInfo[] = await res.json();
          setSymbols(data);
        }
      } catch {
        // Backend not available yet
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [setSymbols]);

  return (
    <div className="flex items-center gap-3">
      {symbols.map((sym) => {
        const config = SYMBOL_CONFIG[sym.symbol] ?? {
          short: sym.symbol.replace("USDT", ""),
          icon: "●",
        };
        const isActive = sym.symbol === activeSymbol;
        const changeColor =
          sym.change_24h !== null
            ? sym.change_24h >= 0
              ? "#00e676"
              : "#ef5350"
            : "#9ca3af";

        return (
          <button
            key={sym.symbol}
            onClick={() => setSymbol(sym.symbol)}
            className={`
              relative flex items-center gap-3 px-4 py-3 rounded-xl
              border transition-all duration-300 cursor-pointer
              hover:border-white/20 group
              ${
                isActive
                  ? "border-white/20 bg-white/[0.04]"
                  : "border-white/5 bg-white/[0.01]"
              }
            `}
            style={
              isActive
                ? {
                    boxShadow:
                      "0 0 20px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.05)",
                  }
                : undefined
            }
          >
            {/* Active indicator dot */}
            {isActive && (
              <div
                className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, #00e676, transparent)",
                }}
              />
            )}

            {/* Icon */}
            <span
              className={`text-lg font-bold transition-colors duration-300 ${
                isActive ? "text-white" : "text-gray-500 group-hover:text-gray-400"
              }`}
            >
              {config.icon}
            </span>

            {/* Symbol info */}
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-bold transition-colors duration-300 ${
                    isActive ? "text-white" : "text-gray-400 group-hover:text-gray-300"
                  }`}
                >
                  {config.short}
                </span>
                <span className="text-[10px] text-gray-600">/USDT</span>
              </div>

              <div className="flex items-center gap-2 mt-0.5">
                {sym.price !== null ? (
                  <>
                    <span className="text-xs text-gray-400 tabular-nums">
                      ${formatPrice(sym.price)}
                    </span>
                    {sym.change_24h !== null && (
                      <span
                        className="text-[10px] font-semibold tabular-nums"
                        style={{ color: changeColor }}
                      >
                        {formatPercent(sym.change_24h)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-gray-600">yükleniyor...</span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
