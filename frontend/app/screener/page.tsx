"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, Loader2, LayoutGrid, ArrowUpRight, ArrowDownRight,
  Activity, TrendingUp, Search, RefreshCw, Flame, BarChart2, Zap
} from "lucide-react";
import { getSignalColor, formatPrice, API_URL } from "@/lib/utils";

// ── Tipler ──────────────────────────────────────────────────────────────────
interface EnrichedCoin {
  // Binance (Teknik Analiz)
  symbol: string;
  price: number;
  change_24h: number;
  volume_usd: number;
  signal_score: number;
  signal_level: string;
  rsi_14: number | null;
  macd_trend: string | null;
  buy_pressure_pct: number;
  sparkline: number[];
  // CoinGecko (Temel Analiz)
  logo: string;
  market_cap: number;
  market_cap_rank: number;
  circulating_supply: number;
  ath_change_pct: number;
}

interface TrendingCoin {
  symbol: string;
  name: string;
  image: string;
  market_cap_rank: number;
}

type FilterType = "all" | "strong_buy" | "high_pressure" | "oversold" | "top_mcap";

// ── Yardımcı Fonksiyonlar ────────────────────────────────────────────────────
function formatMarketCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(0)}`;
}

function getSignalLabel(level: string): string {
  const map: Record<string, string> = {
    "GÜÇLÜ AL SİNYALİ": "GÜÇLÜ AL",
    "AL SİNYALİ":       "AL",
    "BEKLE / NÖTR":     "BEKLE",
    "SAT / ZAYIF":      "SAT",
  };
  return map[level] ?? level;
}

// ── Ana Sayfa ────────────────────────────────────────────────────────────────
export default function ScreenerPage() {
  const [coins, setCoins]       = useState<EnrichedCoin[]>([]);
  const [trending, setTrending] = useState<TrendingCoin[]>([]);
  const [loading, setLoading]   = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [search, setSearch]         = useState("");
  const [filter, setFilter]         = useState<FilterType>("all");
  const [sortBy, setSortBy]         = useState<"mcap" | "signal" | "volume" | "change">("mcap");

  // ── Veri Çekme: Enriched Screener (Binance + CoinGecko) ──────────────────
  const fetchData = async () => {
    try {
      setLoading(true);
      // Önce Render backend (gerçek Binance TA), başarısız/boş ise Next.js rotaları
      const getJson = async (path: string): Promise<any[] | null> => {
        const bases = API_URL ? [API_URL, ""] : [""];
        for (const b of bases) {
          try {
            const r = await fetch(`${b}${path}`);
            if (!r.ok) continue;
            const d = await r.json();
            if (Array.isArray(d) && d.length > 0) return d;
          } catch {
            // sıradaki kaynağa geç
          }
        }
        return null;
      };

      const [coinsData, trendData] = await Promise.all([
        getJson("/api/market/enriched-screener?limit=60"),
        getJson("/api/market/coingecko/trending"),
      ]);

      if (coinsData) {
        setCoins(coinsData);
        setLastUpdated(new Date());
      }
      if (trendData) setTrending(trendData);
    } catch (e) {
      console.error("Veri çekme hatası:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 60_000); // 60s — enriched verisi 60s cache'li
    return () => clearInterval(iv);
  }, []);

  // ── Filtreleme + Sıralama ────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = coins.filter((c) => {
      if (search && !c.symbol.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === "strong_buy"    && c.signal_score < 65)                  return false;
      if (filter === "high_pressure" && c.buy_pressure_pct < 60)              return false;
      if (filter === "oversold"      && (!c.rsi_14 || c.rsi_14 > 40))        return false;
      if (filter === "top_mcap"      && c.market_cap_rank > 20)              return false;
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === "mcap")    return a.market_cap_rank - b.market_cap_rank;
      if (sortBy === "signal")  return b.signal_score - a.signal_score;
      if (sortBy === "volume")  return b.volume_usd - a.volume_usd;
      if (sortBy === "change")  return b.change_24h - a.change_24h;
      return 0;
    });

    return list;
  }, [coins, search, filter, sortBy]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-[#0a0b0d] text-white">

      {/* ── HEADER ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-3 border-b border-white/5 bg-[#0a0b0d]/90 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <LayoutGrid size={14} />
            </div>
            <div>
              <h1 className="text-sm font-bold">Token Tarayıcı</h1>
              <p className="text-[10px] text-gray-500">Binance TA · CoinGecko Temel Analiz</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {loading && <Loader2 size={14} className="text-gray-500 animate-spin" />}
          {lastUpdated && (
            <span className="text-[10px] text-gray-600 font-mono hidden md:block">
              {lastUpdated.toLocaleTimeString("tr-TR")}
            </span>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 disabled:opacity-40 rounded-lg text-xs text-gray-300 transition-colors"
          >
            <RefreshCw size={12} />
            Yenile
          </button>
        </div>
      </header>

      {/* ── TREND COİNLER ────────────────────────────────────────────────── */}
      {trending.length > 0 && (
        <div className="px-6 py-2.5 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-1.5 text-[10px] text-amber-400 font-semibold shrink-0">
              <Flame size={11} />
              TREND
            </div>
            {trending.map((t) => (
              <div key={t.symbol} className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
                {t.image && (
                  <img src={t.image} alt={t.name} width={14} height={14} className="rounded-full" />
                )}
                <span className="text-[11px] font-semibold text-gray-200">{t.symbol.replace("USDT", "")}</span>
                {t.market_cap_rank && (
                  <span className="text-[9px] text-gray-500">#{t.market_cap_rank}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FİLTRE + ARAMA TOOLBAR ───────────────────────────────────────── */}
      <div className="px-6 py-3 border-b border-white/5 flex flex-wrap items-center gap-3">
        {/* Arama */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Coin ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs focus:outline-none focus:border-violet-500 w-40 transition-colors"
          />
        </div>

        {/* Filtreler */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["all", "strong_buy", "high_pressure", "oversold", "top_mcap"] as FilterType[]).map((f) => {
            const labels: Record<FilterType, string> = {
              all: "Tümü",
              strong_buy: "Güçlü Al",
              high_pressure: "Alım Baskısı",
              oversold: "Aşırı Satım",
              top_mcap: "Top 20 Mcap",
            };
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                  filter === f
                    ? "bg-violet-600 border-violet-500 text-white"
                    : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                }`}
              >
                {labels[f]}
              </button>
            );
          })}
        </div>

        {/* Sıralama */}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-gray-600">Sırala:</span>
          {(["mcap", "signal", "volume", "change"] as const).map((s) => {
            const labels = { mcap: "Mcap", signal: "Sinyal", volume: "Hacim", change: "Değişim" };
            return (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${
                  sortBy === s ? "text-violet-400" : "text-gray-600 hover:text-gray-300"
                }`}
              >
                {labels[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TABLO ────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        {loading && coins.length === 0 ? (
          <div className="flex items-center justify-center h-64 gap-2 text-gray-500">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Veriler yükleniyor...</span>
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-2">
            <Search size={24} />
            <p className="text-sm">Sonuç bulunamadı</p>
            <button onClick={() => { setFilter("all"); setSearch(""); }} className="text-xs text-violet-400 hover:underline">
              Filtreleri temizle
            </button>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/5 text-[10px] text-gray-500 uppercase tracking-wider">
                <th className="text-left px-6 py-3 font-medium">#</th>
                <th className="text-left px-2 py-3 font-medium">Coin</th>
                <th className="text-right px-4 py-3 font-medium">Fiyat</th>
                <th className="text-right px-4 py-3 font-medium">24s %</th>
                <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Piyasa Değeri</th>
                <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">Hacim</th>
                <th className="text-center px-4 py-3 font-medium hidden lg:table-cell">RSI</th>
                <th className="text-center px-4 py-3 font-medium hidden lg:table-cell">MACD</th>
                <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Alım %</th>
                <th className="text-center px-4 py-3 font-medium">Sinyal</th>
                <th className="text-right px-4 py-3 font-medium hidden xl:table-cell">Grafik</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((c, i) => {
                const isPositive = c.change_24h >= 0;
                const signalColor = getSignalColor(c.signal_score);
                const isOversold = c.rsi_14 !== null && c.rsi_14 < 35;
                const isOverbought = c.rsi_14 !== null && c.rsi_14 > 70;
                const baseSymbol = c.symbol.replace("USDT", "");

                return (
                  <tr
                    key={c.symbol}
                    className="border-b border-white/[0.03] hover:bg-white/[0.025] transition-colors group"
                  >
                    {/* Rank */}
                    <td className="px-6 py-3 text-[11px] text-gray-600 font-mono">
                      {c.market_cap_rank < 9999 ? `#${c.market_cap_rank}` : `${i + 1}`}
                    </td>

                    {/* Coin */}
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-2.5">
                        {c.logo ? (
                          <img
                            src={c.logo}
                            alt={baseSymbol}
                            width={24}
                            height={24}
                            className="rounded-full shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-bold shrink-0">
                            {baseSymbol[0]}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-[13px] text-white">{baseSymbol}</div>
                          <div className="text-[10px] text-gray-600">USDT</div>
                        </div>
                      </div>
                    </td>

                    {/* Fiyat */}
                    <td className="px-4 py-3 text-right font-mono text-[12px] text-white">
                      ${formatPrice(c.price)}
                    </td>

                    {/* 24s Değişim */}
                    <td className={`px-4 py-3 text-right font-semibold text-[12px] ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                      <div className="flex items-center justify-end gap-0.5">
                        {isPositive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                        {Math.abs(c.change_24h).toFixed(2)}%
                      </div>
                    </td>

                    {/* Piyasa Değeri */}
                    <td className="px-4 py-3 text-right text-[11px] text-gray-400 hidden md:table-cell font-mono">
                      {c.market_cap > 0 ? formatMarketCap(c.market_cap) : "—"}
                    </td>

                    {/* Hacim */}
                    <td className="px-4 py-3 text-right text-[11px] text-gray-400 hidden lg:table-cell font-mono">
                      {formatMarketCap(c.volume_usd)}
                    </td>

                    {/* RSI */}
                    <td className="px-4 py-3 text-center hidden lg:table-cell">
                      <span className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded ${
                        isOversold ? "bg-blue-500/20 text-blue-300" :
                        isOverbought ? "bg-rose-500/20 text-rose-300" :
                        "text-gray-400"
                      }`}>
                        {c.rsi_14 ? c.rsi_14.toFixed(1) : "—"}
                      </span>
                    </td>

                    {/* MACD */}
                    <td className="px-4 py-3 text-center hidden lg:table-cell">
                      <span className={`text-[10px] font-semibold ${
                        c.macd_trend === "bullish" ? "text-emerald-400" :
                        c.macd_trend === "bearish" ? "text-rose-400" : "text-gray-600"
                      }`}>
                        {c.macd_trend === "bullish" ? "↑ Yükseliş" : c.macd_trend === "bearish" ? "↓ Düşüş" : "—"}
                      </span>
                    </td>

                    {/* Alım Baskısı */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`text-[10px] font-bold ${c.buy_pressure_pct > 60 ? "text-orange-400" : "text-gray-400"}`}>
                          %{c.buy_pressure_pct.toFixed(1)}
                        </span>
                        <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${c.buy_pressure_pct > 60 ? "bg-orange-500" : "bg-blue-500/60"}`}
                            style={{ width: `${c.buy_pressure_pct}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Sinyal */}
                    <td className="px-4 py-3 text-center">
                      <div
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold"
                        style={{
                          backgroundColor: `${signalColor}18`,
                          border: `1px solid ${signalColor}35`,
                          color: signalColor,
                        }}
                      >
                        <Zap size={9} />
                        {c.signal_score}
                        <span className="hidden sm:inline opacity-70">· {getSignalLabel(c.signal_level)}</span>
                      </div>
                    </td>

                    {/* Mini Grafik */}
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <MiniSparkline data={c.sparkline} positive={isPositive} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="px-6 py-2.5 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-600">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><BarChart2 size={10} /> Teknik Analiz: <span className="text-gray-400">Binance WebSocket</span></span>
          <span className="flex items-center gap-1"><TrendingUp size={10} /> Temel Analiz: <span className="text-gray-400">CoinGecko API</span></span>
        </div>
        <span>{displayed.length} coin gösteriliyor</span>
      </footer>
    </div>
  );
}

// ── Mini Sparkline ────────────────────────────────────────────────────────────
function MiniSparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data || data.length < 2) return <span className="text-gray-700 text-[10px]">—</span>;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 80, H = 24;

  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * H}`)
    .join(" ");

  return (
    <svg width={W} height={H} className="opacity-70">
      <polyline fill="none" stroke={positive ? "#34d399" : "#fb7185"} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}
