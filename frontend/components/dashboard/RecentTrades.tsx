"use client";

import React, { useState, useEffect, useRef } from "react";
import { Loader2, ArrowDownRight, ArrowUpRight, History } from "lucide-react";

interface RecentTradesProps {
  symbol: string;
  exchange?: "binance" | "mexc";
}

interface TradeItem {
  id: string | number;
  price: number;
  qty: number;
  time: string;
  isSell: boolean;
}

export default function RecentTrades({ symbol, exchange = "binance" }: RecentTradesProps) {
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const tradesRef = useRef<TradeItem[]>([]);

  useEffect(() => {
    tradesRef.current = [];
    setTrades([]);
    setIsLoading(true);

    let ws: WebSocket | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    if (exchange === "mexc") {
      const fetchTrades = async () => {
        try {
          const res = await fetch(`/api/mexc?endpoint=deals&symbol=${symbol}&limit=30`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
              const formatted: TradeItem[] = data.map((d: any) => ({
                id: d.id || `${d.time}-${Math.random()}`,
                price: parseFloat(d.price),
                qty: parseFloat(d.qty),
                time: new Date(d.time).toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" }),
                isSell: !d.isBuyerMaker,
              }));
              setTrades(formatted.slice(0, 25));
              setIsLoading(false);
            }
          }
        } catch (err) {
          console.error("MEXC trades error:", err);
        }
      };

      fetchTrades();
      pollInterval = setInterval(fetchTrades, 2000);
    } else {
      // Binance aggTrade WebSocket
      const cleanSym = symbol.toLowerCase();
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${cleanSym}@aggTrade`);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const trade: TradeItem = {
            id: data.a,
            price: parseFloat(data.p),
            qty: parseFloat(data.q),
            time: new Date(data.T).toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" }),
            isSell: data.m,
          };

          tradesRef.current = [trade, ...tradesRef.current].slice(0, 25);
          setTrades([...tradesRef.current]);
          setIsLoading(false);
        } catch {
          // ignore
        }
      };

      ws.onerror = () => {
        setIsLoading(false);
      };
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (ws) ws.close();
    };
  }, [symbol, exchange]);

  return (
    <div className="flex flex-col h-full bg-[#0d0e12]/80 border border-white/5 rounded-xl p-3 text-xs font-mono backdrop-blur select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-2">
        <div className="flex items-center gap-1.5 text-gray-300 font-sans font-semibold text-[11px]">
          <History size={13} className="text-indigo-400" />
          <span>Piyasa İşlemleri</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400 uppercase">
            {exchange}
          </span>
        </div>
        <span className="text-[10px] text-gray-500 font-sans">Son 25 İşlem</span>
      </div>

      {/* Sütun Başlıkları */}
      <div className="grid grid-cols-3 text-[10px] text-gray-500 font-sans pb-1 px-1">
        <span>Fiyat (USDT)</span>
        <span className="text-right">Miktar</span>
        <span className="text-right">Zaman</span>
      </div>

      {isLoading && trades.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 gap-2">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-[11px] font-sans">İşlemler yükleniyor...</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-[2px] pr-1">
          {trades.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-3 items-center px-1 py-[2px] rounded hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-1">
                {t.isSell ? (
                  <ArrowDownRight size={10} className="text-rose-400" />
                ) : (
                  <ArrowUpRight size={10} className="text-emerald-400" />
                )}
                <span className={`font-semibold ${t.isSell ? "text-rose-400" : "text-emerald-400"}`}>
                  {t.price.toFixed(4)}
                </span>
              </div>
              <span className="text-right text-gray-300">{t.qty.toFixed(3)}</span>
              <span className="text-right text-gray-500 text-[10px]">{t.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
