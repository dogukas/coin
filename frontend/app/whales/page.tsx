"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, ArrowRightLeft, ArrowDownRight, ArrowUpRight, Activity, Fish, Search } from "lucide-react";
import { API_URL, formatPrice } from "@/lib/utils";

interface WhaleTx {
  id: string;
  coin: string;
  amount: number;
  amount_usd: number;
  sender: string;
  receiver: string;
  type: "inflow" | "outflow" | "transfer";
  alert_level: "danger" | "warning" | "success" | "neutral";
  timestamp: number;
  hash: string;
}

export default function WhalesPage() {
  const [transactions, setTransactions] = useState<WhaleTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "inflow" | "outflow">("all");

  const fetchWhales = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/market/whales?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWhales();
    const interval = setInterval(fetchWhales, 45000); // 45s refresh
    return () => clearInterval(interval);
  }, []);

  const filtered = transactions.filter(t => filter === "all" || t.type === filter);

  const formatAmount = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const getTimeAgo = (ts: number) => {
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return `${diff} sn önce`;
    const mins = Math.floor(diff / 60);
    return `${mins} dk önce`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white pb-20 sm:pb-0">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-white/5 bg-slate-900/50 gap-3 sticky top-0 z-20 backdrop-blur-xl">
        <div className="flex items-center gap-3 md:gap-4">
          <Link href="/" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Fish size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base md:text-lg font-bold">On-Chain Balina Radarı</h1>
              <p className="text-[10px] md:text-xs text-gray-400">Devasa borsa transferleri ve soğuk cüzdan hareketleri</p>
            </div>
          </div>
        </div>
        
        <button 
          onClick={fetchWhales}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 border border-cyan-500/30 disabled:opacity-50 text-xs font-bold transition-colors flex items-center gap-2"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
          Yenile
        </button>
      </header>

      {/* Info & Filters */}
      <div className="p-4 md:p-6 pb-0 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-rose-950/30 border border-rose-500/20 rounded-xl p-4 flex flex-col">
            <span className="text-xs text-rose-400 font-bold flex items-center gap-1.5 mb-1">
              <ArrowDownRight size={14} /> Borsaya Giriş (Inflow)
            </span>
            <span className="text-[10px] text-gray-400">Soğuk cüzdandan borsaya para giriyorsa "Satış Baskısı" (Dump) habercisi olabilir.</span>
          </div>
          <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-xl p-4 flex flex-col">
            <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 mb-1">
              <ArrowUpRight size={14} /> Borsadan Çıkış (Outflow)
            </span>
            <span className="text-[10px] text-gray-400">Borsadan soğuk cüzdana para çıkıyorsa "Hold / Uzun Vade" (Arz Şoku) habercisi olabilir.</span>
          </div>
          <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4 flex flex-col justify-center">
            <div className="flex gap-2 bg-black/20 p-1 rounded-lg">
              <button 
                onClick={() => setFilter("all")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${filter === "all" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}
              >Tümü</button>
              <button 
                onClick={() => setFilter("inflow")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${filter === "inflow" ? "bg-rose-500/20 text-rose-400" : "text-gray-500 hover:text-rose-400"}`}
              >Girişler (Risk)</button>
              <button 
                onClick={() => setFilter("outflow")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${filter === "outflow" ? "bg-emerald-500/20 text-emerald-400" : "text-gray-500 hover:text-emerald-400"}`}
              >Çıkışlar</button>
            </div>
          </div>
        </div>
      </div>

      {/* Main List */}
      <main className="flex-1 px-4 md:px-6 pb-6 overflow-y-auto custom-scrollbar max-w-6xl mx-auto w-full">
        {loading && transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-500">
            <Loader2 size={24} className="animate-spin mb-2" />
            <span className="text-xs">Balina hareketleri taranıyor...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-500 bg-white/5 rounded-2xl border border-white/5">
            <Search size={24} className="mb-2 opacity-50" />
            <span className="text-xs">Bu kritere uyan hareket bulunamadı.</span>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((tx) => (
              <div 
                key={tx.id} 
                className={`
                  p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors hover:bg-white/[0.02]
                  ${tx.type === 'inflow' ? 'bg-rose-950/10 border-rose-500/10' : 
                    tx.type === 'outflow' ? 'bg-emerald-950/10 border-emerald-500/10' : 
                    'bg-slate-900/30 border-white/5'}
                `}
              >
                {/* Amount & Coin */}
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center border shadow-inner font-black text-lg
                    ${tx.type === 'inflow' ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 
                      tx.type === 'outflow' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 
                      'bg-slate-800 border-slate-700 text-gray-300'}
                  `}>
                    {tx.coin.slice(0, 3)}
                  </div>
                  <div>
                    <div className="text-xl md:text-2xl font-black tabular-nums tracking-tight drop-shadow-sm">
                      {formatAmount(tx.amount)} <span className="text-sm font-bold opacity-50">{tx.coin}</span>
                    </div>
                    <div className="text-xs font-mono text-gray-400">
                      ≈ ${formatAmount(tx.amount_usd)}
                    </div>
                  </div>
                </div>

                {/* Transfer Path */}
                <div className="flex-1 flex items-center justify-center gap-3 py-2 md:py-0 border-y border-white/5 md:border-0 my-2 md:my-0">
                  <div className="text-right">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Gönderen</div>
                    <div className="text-sm font-bold text-gray-300">{tx.sender}</div>
                  </div>
                  
                  <div className={`px-2 py-1 rounded-full border flex-shrink-0
                    ${tx.type === 'inflow' ? 'bg-rose-500/20 border-rose-500/40 text-rose-400' : 
                      tx.type === 'outflow' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 
                      'bg-gray-800 border-gray-600 text-gray-400'}
                  `}>
                    <ArrowRightLeft size={16} />
                  </div>

                  <div className="text-left">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Alıcı</div>
                    <div className="text-sm font-bold text-gray-300">{tx.receiver}</div>
                  </div>
                </div>

                {/* Status & Time */}
                <div className="flex items-center justify-between md:flex-col md:items-end gap-1">
                  <div className={`px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider
                    ${tx.alert_level === 'danger' ? 'bg-red-500 text-white animate-pulse shadow-[0_0_10px_red]' : 
                      tx.alert_level === 'warning' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                      tx.alert_level === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      'bg-slate-800 text-gray-400 border border-slate-700'}
                  `}>
                    {tx.type === 'inflow' ? 'BORSAYA GİRİŞ (RİSK)' : tx.type === 'outflow' ? 'CÜZDANA ÇIKIŞ' : 'TRANSFER'}
                  </div>
                  <div className="text-[11px] font-mono text-gray-500 flex items-center gap-1.5">
                    {getTimeAgo(tx.timestamp)}
                    <a href="#" className="text-cyan-500 hover:text-cyan-400 underline decoration-cyan-500/30">TxHash</a>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
