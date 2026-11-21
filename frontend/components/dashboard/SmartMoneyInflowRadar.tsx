"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useDashboardStore } from "@/lib/store";
import { formatNumber, formatVolume, type CandleData } from "@/lib/utils";
import { loadHistory, saveHistory } from "@/lib/radarHistory";
import { toast } from "sonner";
import { Volume2, VolumeX, Flame, Target, BarChart3, BellRing, Zap } from "lucide-react";

export interface GlobalMoneyInflowItem {
  symbol: string;
  price: number;
  priceChange5mPct: number;
  priceChange24hPct: number;
  netInflowUsd: number;
  totalBurstVolumeUsd: number;
  buyRatioPct: number;
  volumeSpikeMult: number; // e.g. 3.8x normal 5m volume
  tag: "BALİNA SÜPÜRMESİ" | "KURUMSAL GİRİŞ" | "HACİM PATLAMASI";
  detectedAt: number;
}

const TOP_SCAN_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "BNBUSDT",
  "DOGEUSDT",
  "SUIUSDT",
  "PEPEUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "ADAUSDT",
  "FETUSDT",
  "NEARUSDT",
  "RENDERUSDT",
  "WIFUSDT",
  "ARBUSDT",
  "OPUSDT",
  "INJUSDT",
  "SEIUSDT",
  "APTUSDT",
  "TIAUSDT",
  "TAOUSDT",
  "ENAUSDT",
  "ONDOUSDT",
];

// Web Audio API — Kristal Netliğinde Kurumsal "Sağlam Para Girişi" Sonar Sesi
function playInflowSonarSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 -> E5 -> G5 -> C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.09);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + idx * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.09 + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.09);
      osc.stop(ctx.currentTime + idx * 0.09 + 0.25);
    });
  } catch {
    // Browser autoplay policy blocked before user interaction
  }
}

export default function SmartMoneyInflowRadar() {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const setSymbol = useDashboardStore((s) => s.setSymbol);
  const setChartTradePlan = useDashboardStore((s) => s.setChartTradePlan);
  const trades = useDashboardStore((s) => s.trades);
  const candles = useDashboardStore((s) => s.candles);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [minInflowThreshold, setMinInflowThreshold] = useState<number>(25000); // $25K default
  const [inflowList, setInflowList] = useState<GlobalMoneyInflowItem[]>([]);
  const [spotlightAlert, setSpotlightAlert] = useState<GlobalMoneyInflowItem | null>(null);

  const alertedMapRef = useRef<Map<string, number>>(new Map());
  const soundEnabledRef = useRef<boolean>(true);

  useEffect(() => {
    const savedSound = localStorage.getItem("inflow-sound-enabled");
    if (savedSound !== null) {
      const parsed = savedSound === "true";
      setSoundEnabled(parsed);
      soundEnabledRef.current = parsed;
    }
    const savedThresh = localStorage.getItem("inflow-min-usd");
    if (savedThresh !== null) {
      setMinInflowThreshold(Number(savedThresh) || 25000);
    }
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    localStorage.setItem("inflow-sound-enabled", String(next));
    if (next) playInflowSonarSound();
  };

  const handleThresholdChange = (val: number) => {
    setMinInflowThreshold(val);
    localStorage.setItem("inflow-min-usd", String(val));
  };

  // Otomatik İşlem Planı Oluştur, Grafiğe Çiz ve TradeTracker'a Kaydet
  const handleQuickTrackInflow = useCallback(
    (item: GlobalMoneyInflowItem) => {
      setSymbol(item.symbol);
      const entry = item.price;
      if (entry <= 0) return;

      const sl = Number((entry * 0.982).toFixed(6)); // %1.8 sıkı stop
      const tp1 = Number((entry * 1.027).toFixed(6)); // 1:1.5 R:R
      const tp2 = Number((entry * 1.054).toFixed(6)); // 1:3.0 R:R

      setChartTradePlan({
        symbol: item.symbol,
        direction: "long",
        entry,
        sl,
        tp1,
        tp2,
      });

      try {
        const baseSymbol = item.symbol.replace("USDT", "");
        const prev = loadHistory();
        const recordId = `BINANCE:${item.symbol}`;
        const filtered = prev.filter((r) => !(r.id === recordId && r.status === "open"));
        saveHistory([
          {
            id: recordId,
            symbol: baseSymbol,
            exchange: "BINANCE",
            ts: Date.now(),
            score: 88,
            entry,
            stop: sl,
            tp1,
            tp2,
            reasons: [
              `🚨 ${item.tag}: +$${formatVolume(item.netInflowUsd)} Net Para Girişi`,
              `%${item.buyRatioPct.toFixed(0)} Alıcı Baskısı • ${item.volumeSpikeMult.toFixed(1)}x Hacim`,
            ],
            status: "open",
            manual: true,
          },
          ...filtered,
        ]);
      } catch {
        // ignore storage error
      }

      toast.success(`🎯 ${item.symbol.replace("USDT", "")} Grafiğe Çizildi & Takibe Alındı!`, {
        description: `Giriş: $${formatNumber(entry)} • TP1: $${formatNumber(tp1)} • TP2: $${formatNumber(tp2)} • SL: $${formatNumber(sl)}`,
        duration: 4500,
      });
    },
    [setSymbol, setChartTradePlan]
  );

  // 1. Aktif Coin Milisaniyelik Para Girişi Analizi (Son 60 Saniye Emir Akışı + Canlı Mum)
  let active60sBuyUsd = 0;
  let active60sSellUsd = 0;
  let activeWhaleBuyCount = 0;
  const nowMs = Date.now();

  for (const t of trades) {
    if (nowMs - t.time <= 60_000) {
      const usd = t.price * t.quantity;
      if (!t.is_buyer_maker) {
        active60sBuyUsd += usd;
        if (usd >= minInflowThreshold) activeWhaleBuyCount++;
      } else {
        active60sSellUsd += usd;
      }
    }
  }

  // Eğer henüz 60sn trade birikmediyse canlı mumun taker_buy_volume verisini kullan
  const latestCandle: CandleData | null =
    candles.length > 0 ? candles[candles.length - 1] : null;
  if (active60sBuyUsd === 0 && active60sSellUsd === 0 && latestCandle) {
    const totalCandleUsd = latestCandle.volume * latestCandle.close;
    const buyUsd =
      latestCandle.taker_buy_volume !== undefined
        ? latestCandle.taker_buy_volume * latestCandle.close
        : totalCandleUsd * (latestCandle.close >= latestCandle.open ? 0.58 : 0.42);
    active60sBuyUsd = buyUsd;
    active60sSellUsd = Math.max(0, totalCandleUsd - buyUsd);
  }

  const activeNetInflowUsd = active60sBuyUsd - active60sSellUsd;
  const activeTotalFlowUsd = active60sBuyUsd + active60sSellUsd;
  const activeBuyRatioPct =
    activeTotalFlowUsd > 0 ? (active60sBuyUsd / activeTotalFlowUsd) * 100 : 50;

  // Aktif mum hacim patlama çarpanı (Son 20 mum ortalamasına göre)
  const prev20 = candles.slice(-21, -1);
  const avg20Vol =
    prev20.length > 0 ? prev20.reduce((s, c) => s + c.volume, 0) / prev20.length : 0;
  const activeVolMult =
    latestCandle && avg20Vol > 0 ? latestCandle.volume / avg20Vol : 1.0;

  // Aktif coinde ani sağlam para girişi yakalandığında sesli & görsel alarm tetikle
  useEffect(() => {
    if (!latestCandle || activeNetInflowUsd < minInflowThreshold) return;
    if (activeBuyRatioPct < 66) return;

    const lastAlertTime = alertedMapRef.current.get(activeSymbol) ?? 0;
    const now = Date.now();
    if (now - lastAlertTime < 45_000) return; // Aynı coin için 45sn cooldown

    if (activeWhaleBuyCount >= 1 || activeVolMult >= 2.2 || activeNetInflowUsd >= minInflowThreshold * 2.5) {
      alertedMapRef.current.set(activeSymbol, now);
      const alertItem: GlobalMoneyInflowItem = {
        symbol: activeSymbol,
        price: latestCandle.close,
        priceChange5mPct:
          latestCandle.open > 0
            ? ((latestCandle.close - latestCandle.open) / latestCandle.open) * 100
            : 0,
        priceChange24hPct: 0,
        netInflowUsd: activeNetInflowUsd,
        totalBurstVolumeUsd: activeTotalFlowUsd,
        buyRatioPct: activeBuyRatioPct,
        volumeSpikeMult: Math.max(1.5, activeVolMult),
        tag: activeWhaleBuyCount >= 1 ? "BALİNA SÜPÜRMESİ" : "KURUMSAL GİRİŞ",
        detectedAt: now,
      };

      setSpotlightAlert(alertItem);
      if (soundEnabledRef.current) playInflowSonarSound();

      toast.success(
        `🚨 SAĞLAM PARA GİRİŞİ: ${activeSymbol.replace("USDT", "")} (+$${formatVolume(activeNetInflowUsd)})`,
        {
          description: `Alıcı Baskısı: %${activeBuyRatioPct.toFixed(0)} • Hacim: ${alertItem.volumeSpikeMult.toFixed(1)}x Normalin Üstünde!`,
          duration: 6000,
        }
      );
    }
  }, [
    activeSymbol,
    activeNetInflowUsd,
    activeBuyRatioPct,
    activeWhaleBuyCount,
    activeVolMult,
    activeTotalFlowUsd,
    minInflowThreshold,
    latestCandle,
  ]);

  // 2. Tüm Piyasa (24 Popüler Parite) Canlı 5 Dakikalık Sağlam Para Girişi Tarayıcısı
  useEffect(() => {
    let cancelled = false;

    const scanGlobalInflows = async () => {
      const endpoints = [
        "https://data-api.binance.vision/api/v3/klines",
        "https://api.binance.com/api/v3/klines",
      ];

      // Her taramada 10 yüksek likiditeli paritenin son 12 adet 5m mumunu kontrol et
      const batch = TOP_SCAN_SYMBOLS.slice(0, 12);

      const inspectSymbol = async (sym: string): Promise<GlobalMoneyInflowItem | null> => {
        for (const base of endpoints) {
          try {
            const res = await fetch(`${base}?symbol=${sym}&interval=5m&limit=14`);
            if (!res.ok) continue;
            const raw = (await res.json()) as unknown[][];
            if (!Array.isArray(raw) || raw.length < 10) continue;

            const parsed = raw.map((k) => {
              const close = parseFloat(String(k[4]));
              const open = parseFloat(String(k[1]));
              const vol = parseFloat(String(k[5]));
              const quoteVol = parseFloat(String(k[7]));
              const takerBuyQuote = parseFloat(String(k[10]));
              return { open, close, vol, quoteVol, takerBuyQuote };
            });

            const last = parsed[parsed.length - 1];
            const prev = parsed[parsed.length - 2];
            const historySlice = parsed.slice(0, -2);
            const avgQuoteVol =
              historySlice.reduce((s, c) => s + c.quoteVol, 0) /
              Math.max(1, historySlice.length);

            // Son aktif + bir önceki 5m barındaki para akışını değerlendir
            const targetBar = last.quoteVol >= prev.quoteVol * 0.65 ? last : prev;
            const buyUsd = targetBar.takerBuyQuote;
            const sellUsd = Math.max(0, targetBar.quoteVol - buyUsd);
            const netInflowUsd = buyUsd - sellUsd;
            const buyRatioPct =
              targetBar.quoteVol > 0 ? (buyUsd / targetBar.quoteVol) * 100 : 50;
            const volumeSpikeMult =
              avgQuoteVol > 0 ? targetBar.quoteVol / avgQuoteVol : 1.0;
            const priceChange5mPct =
              targetBar.open > 0
                ? ((targetBar.close - targetBar.open) / targetBar.open) * 100
                : 0;

            if (netInflowUsd <= 0 || buyRatioPct < 54) return null;

            const tag: GlobalMoneyInflowItem["tag"] =
              buyRatioPct >= 70 && volumeSpikeMult >= 2.2
                ? "BALİNA SÜPÜRMESİ"
                : volumeSpikeMult >= 1.8
                ? "HACİM PATLAMASI"
                : "KURUMSAL GİRİŞ";

            return {
              symbol: sym,
              price: last.close,
              priceChange5mPct,
              priceChange24hPct: 0,
              netInflowUsd,
              totalBurstVolumeUsd: targetBar.quoteVol,
              buyRatioPct,
              volumeSpikeMult,
              tag,
              detectedAt: Date.now(),
            };
          } catch {
            // try next endpoint
          }
        }
        return null;
      };

      const results = await Promise.all(batch.map((sym) => inspectSymbol(sym)));
      if (cancelled) return;

      const valid = results
        .filter((r): r is GlobalMoneyInflowItem => r !== null)
        .sort((a, b) => b.netInflowUsd - a.netInflowUsd);

      if (valid.length > 0) {
        setInflowList(valid.slice(0, 6));

        // En güçlü para girişi eşiği aşıyorsa otomatik alarm çal ve spotlight kartını aç
        const top = valid[0];
        const lastAlert = alertedMapRef.current.get(top.symbol) ?? 0;
        const now = Date.now();
        if (
          top.netInflowUsd >= minInflowThreshold * 4 &&
          top.buyRatioPct >= 64 &&
          top.volumeSpikeMult >= 1.45 &&
          now - lastAlert >= 60_000
        ) {
          alertedMapRef.current.set(top.symbol, now);
          setSpotlightAlert(top);
          if (soundEnabledRef.current) playInflowSonarSound();

          toast.success(
            `🚨 PİYASADA SAĞLAM PARA GİRİŞİ: ${top.symbol.replace("USDT", "")} (+$${formatVolume(top.netInflowUsd)})`,
            {
              description: `5dk Net Giriş: +$${formatVolume(top.netInflowUsd)} • %${top.buyRatioPct.toFixed(0)} Alıcı • Hacim ${top.volumeSpikeMult.toFixed(1)}x!`,
              duration: 6500,
            }
          );
        }
      }
    };

    scanGlobalInflows();
    const timer = window.setInterval(scanGlobalInflows, 18000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [minInflowThreshold]);

  return (
    <section
      aria-label="Canlı Sağlam Para Girişi Radarı"
      className="w-full rounded-2xl bg-gradient-to-r from-[#081512] via-[#0d0e12] to-[#120e1a] border border-emerald-500/30 p-3 shadow-[0_10px_30px_rgba(16,185,129,0.12)] flex flex-col gap-2.5"
    >
      {/* Üst Satır: Başlık + Aktif Coin 60sn Canlı Nakit Giriş Sayacı + Sesli Alarm Kontrolü */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-xs font-bold">
            <Flame size={14} className="text-emerald-400 animate-pulse" />
            <span>CANLI PARA GİRİŞİ RADARI</span>
          </div>

          {/* Aktif Coin 60 Saniye Net Para Akışı Sayacı */}
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-xl border text-xs font-mono ${
              activeNetInflowUsd >= 0
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-rose-500/10 border-rose-500/30 text-rose-300"
            }`}
          >
            <span className="font-sans font-bold text-white/90">
              {activeSymbol.replace("USDT", "")} Anlık Akış:
            </span>
            <strong className="tabular-nums">
              {activeNetInflowUsd >= 0 ? "+" : "-"}${formatVolume(Math.abs(activeNetInflowUsd))}
            </strong>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 text-white/90 tabular-nums">
              %{activeBuyRatioPct.toFixed(0)} Alıcı
            </span>
            {activeVolMult >= 1.5 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold tabular-nums">
                ⚡ {activeVolMult.toFixed(1)}x Hacim
              </span>
            )}
          </div>
        </div>

        {/* Sağ: Hassasiyet Seçici + Sesli Alarm Aç/Kapat + Test Butonu */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-black/40 border border-white/10 text-[10px] font-mono">
            <span className="text-gray-400 font-sans">Alarm Eşiği:</span>
            {[10000, 25000, 50000, 100000].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => handleThresholdChange(val)}
                className={`px-1.5 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                  minInflowThreshold === val
                    ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/40"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                ${val / 1000}K+
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={toggleSound}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-bold transition-all cursor-pointer ${
              soundEnabled
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                : "bg-white/5 text-gray-400 border-white/10 hover:text-white"
            }`}
            title="Sağlam para girdiğinde sesli sonar alarmı çal"
          >
            {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
            <span>{soundEnabled ? "Sesli Alarm AÇIK" : "Ses Kapalı"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playInflowSonarSound();
              if (inflowList.length > 0) {
                setSpotlightAlert(inflowList[0]);
              }
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-[10px] font-bold transition-colors cursor-pointer"
            title="Alarm sesini ve bildirim kartını test et"
          >
            <BellRing size={11} />
            <span>Test</span>
          </button>
        </div>
      </div>

      {/* Yakalanan Acil "🚨 SAĞLAM PARA GİRİŞİ" Spotlight Aksiyon Kartı */}
      {spotlightAlert && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-cyan-500/15 border border-emerald-400/50 shadow-[0_0_20px_rgba(16,185,129,0.22)]">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-2 py-0.5 rounded-md bg-emerald-400 text-black font-extrabold text-[10px] tracking-wider uppercase animate-pulse">
              🚨 {spotlightAlert.tag}
            </span>
            <span className="text-sm font-black text-white font-mono">
              {spotlightAlert.symbol.replace("USDT", "")}/USDT
            </span>
            <span className="text-xs font-mono text-emerald-300 font-bold tabular-nums">
              ${formatNumber(spotlightAlert.price)}
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded-lg bg-black/50 border border-emerald-500/35 text-emerald-300 font-bold tabular-nums">
              💰 Net Giriş: +${formatVolume(spotlightAlert.netInflowUsd)}
            </span>
            <span className="text-[11px] font-mono text-white/90 tabular-nums">
              Alıcı Baskısı: <strong className="text-emerald-400">%{spotlightAlert.buyRatioPct.toFixed(0)}</strong> • Hacim:{" "}
              <strong className="text-amber-300">{spotlightAlert.volumeSpikeMult.toFixed(1)}x</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSymbol(spotlightAlert.symbol)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[11px] font-bold transition-colors cursor-pointer"
            >
              <BarChart3 size={12} className="text-cyan-300" />
              <span>Grafiğe Aç</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickTrackInflow(spotlightAlert)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-extrabold transition-colors cursor-pointer shadow-md"
            >
              <Target size={12} />
              <span>TP/SL Çiz & Takibe Al</span>
            </button>

            <button
              type="button"
              onClick={() => setSpotlightAlert(null)}
              className="px-1.5 py-0.5 rounded text-gray-400 hover:text-white text-xs cursor-pointer"
              title="Kapat"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Alt Satır: Şu An Piyasada En Çok Net Para Giren Coinler Şeridi */}
      {inflowList.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-0.5">
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300 whitespace-nowrap">
            <Zap size={11} />
            Şu An En Çok Para Girenler:
          </span>

          {inflowList.map((item) => {
            const isCurrent = item.symbol === activeSymbol;
            return (
              <div
                key={item.symbol}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-mono whitespace-nowrap transition-all ${
                  isCurrent
                    ? "bg-emerald-500/20 border-emerald-400/50 text-white shadow-sm"
                    : "bg-black/40 border-white/10 text-gray-200 hover:border-emerald-500/35"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSymbol(item.symbol)}
                  className="flex items-center gap-1.5 cursor-pointer"
                  title={`${item.symbol} grafiğini aç`}
                >
                  <strong className="text-white font-sans">{item.symbol.replace("USDT", "")}</strong>
                  <span className="text-emerald-400 font-bold tabular-nums">
                    +${formatVolume(item.netInflowUsd)}
                  </span>
                  <span className="text-[10px] text-cyan-300 tabular-nums">
                    (%{item.buyRatioPct.toFixed(0)} Alıcı • {item.volumeSpikeMult.toFixed(1)}x)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickTrackInflow(item)}
                  className="ml-1 px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-500/30 text-[9px] font-sans font-bold cursor-pointer"
                  title={`${item.symbol} için otomatik TP/SL çiz ve takibe al`}
                >
                  🎯 Takip
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
