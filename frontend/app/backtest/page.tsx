"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Target, TrendingUp, TrendingDown, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

// Mock data representing recent AI signals
const MOCK_SIGNALS = [
  { id: 1, symbol: "SOLUSDT", type: "strong_buy", entry: 142.50, exit: 148.20, time: "2 saat önce", profitPct: 4.00, status: "won" },
  { id: 2, symbol: "DOGEUSDT", type: "buy", entry: 0.1105, exit: 0.1140, time: "3.5 saat önce", profitPct: 3.16, status: "won" },
  { id: 3, symbol: "WIFUSDT", type: "strong_buy", entry: 2.15, exit: 2.11, time: "5 saat önce", profitPct: -1.86, status: "lost" },
  { id: 4, symbol: "PEPEUSDT", type: "strong_buy", entry: 0.00000850, exit: 0.00000910, time: "7 saat önce", profitPct: 7.05, status: "won" },
  { id: 5, symbol: "BTCUSDT", type: "buy", entry: 64200.0, exit: 64550.0, time: "8 saat önce", profitPct: 0.54, status: "won" },
  { id: 6, symbol: "ETHUSDT", type: "sell", entry: 3450.0, exit: 3380.0, time: "11 saat önce", profitPct: 2.02, status: "won" },
  { id: 7, symbol: "RENDERUSDT", type: "strong_buy", entry: 6.85, exit: 7.45, time: "14 saat önce", profitPct: 8.75, status: "won" },
  { id: 8, symbol: "TIAUSDT", type: "buy", entry: 5.12, exit: 5.25, time: "18 saat önce", profitPct: 2.53, status: "won" },
  { id: 9, symbol: "INJUSDT", type: "strong_buy", entry: 24.50, exit: 23.90, time: "21 saat önce", profitPct: -2.44, status: "lost" },
  { id: 10, symbol: "AVAXUSDT", type: "buy", entry: 28.30, exit: 29.50, time: "23 saat önce", profitPct: 4.24, status: "won" }
];

export default function BacktestPage() {
  const [winRate, setWinRate] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);

  useEffect(() => {
    const wins = MOCK_SIGNALS.filter(s => s.profitPct > 0).length;
    setWinRate(Math.round((wins / MOCK_SIGNALS.length) * 100));
    setTotalProfit(MOCK_SIGNALS.reduce((acc, s) => acc + s.profitPct, 0));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#020205] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-900/50">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Target size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Yapay Zeka Sinyal Geçmişi</h1>
              <p className="text-xs text-gray-400">Son 24 saat içindeki sinyaller ve başarı oranları</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
            <span className="text-sm text-gray-400 font-semibold mb-2">Başarı Oranı (Win Rate)</span>
            <div className="text-4xl font-bold text-emerald-400">%{winRate}</div>
            <span className="text-xs text-emerald-500 mt-2 flex items-center gap-1">
              <CheckCircle2 size={12} /> {MOCK_SIGNALS.filter(s => s.status === "won").length} Kazanç / {MOCK_SIGNALS.filter(s => s.status === "lost").length} Kayıp
            </span>
          </div>
          
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />
            <span className="text-sm text-gray-400 font-semibold mb-2">Toplam Net Kâr (24s)</span>
            <div className="text-4xl font-bold text-blue-400">+{totalProfit.toFixed(2)}%</div>
            <span className="text-xs text-blue-500 mt-2">Bileşik olmayan toplam (Her sinyale eşit yatırım)</span>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl" />
            <span className="text-sm text-gray-400 font-semibold mb-2">Üretilen Sinyal Sayısı</span>
            <div className="text-4xl font-bold text-white">{MOCK_SIGNALS.length}</div>
            <span className="text-xs text-gray-500 mt-2">Sadece Güçlü Al/Sat sinyalleri baz alınmıştır</span>
          </div>
        </div>

        {/* Table */}
        <div className="bg-slate-900/50 border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 text-xs text-gray-400 uppercase tracking-wider">
                <th className="px-6 py-4 font-semibold">Tarih</th>
                <th className="px-6 py-4 font-semibold">Parite</th>
                <th className="px-6 py-4 font-semibold">Sinyal Türü</th>
                <th className="px-6 py-4 font-semibold">Giriş (Hedef)</th>
                <th className="px-6 py-4 font-semibold">Kapanış (Gerçekleşen)</th>
                <th className="px-6 py-4 font-semibold text-right">Sonuç / Kâr</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {MOCK_SIGNALS.map((s) => (
                <tr key={s.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-gray-400 flex items-center gap-2">
                    <Clock size={14} /> {s.time}
                  </td>
                  <td className="px-6 py-4 font-bold">{s.symbol.replace("USDT", "")}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      s.type === 'strong_buy' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 
                      s.type === 'buy' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20' :
                      'bg-rose-500/20 text-rose-400 border border-rose-500/20'
                    }`}>
                      {s.type === 'strong_buy' ? 'GÜÇLÜ AL' : s.type === 'buy' ? 'AL' : 'SAT'}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-gray-300">${s.entry}</td>
                  <td className="px-6 py-4 font-mono text-gray-300">${s.exit}</td>
                  <td className="px-6 py-4 text-right">
                    <div className={`flex items-center justify-end gap-1 font-bold ${s.profitPct > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {s.profitPct > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      {s.profitPct > 0 ? '+' : ''}{s.profitPct}%
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
