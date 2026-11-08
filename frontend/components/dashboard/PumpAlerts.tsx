"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Flame, Zap } from "lucide-react";
import { API_URL, formatPrice } from "@/lib/utils";
import { useDashboardStore } from "@/lib/store";
import type { RadarPayload } from "@/lib/pumpRadar";
import { addAlerts, evaluateHistory, loadHistory, saveHistory } from "@/lib/radarHistory";
import { alertEvents, loadEvents, MAX_EVENTS, saveEvents, trackProgress } from "@/lib/radarEvents";
import { showSystemNotification } from "@/lib/radarNotify";

interface PumpAlert {
  symbol: string;
  price: number;
  change_5m: number;
  change_15m: number;
  change_24h: number;
  volume_usd: number;
  vol_spike: number;
  type: "pump" | "dump";
  intensity: "moderate" | "high" | "extreme";
}

export default function PumpAlerts() {
  const setSymbol = useDashboardStore((s) => s.setSymbol);
  const alertedSymbols = useRef<Map<string, number>>(new Map());
  const lastRadarCheckRef = useRef<number>(0);

  useEffect(() => {
    // 1) Pump Radar arka plan tarayıcısı (/radar dışındaki sayfalarda da mobil/masaüstü bildirimlerin sürmesi için)
    const pollRadarBackground = async () => {
      if (typeof window === "undefined") return;
      // Kullanıcı zaten /radar sayfasındaysa o sayfa kendi taramasını yapıyor
      if (window.location.pathname.startsWith("/radar")) return;

      const now = Date.now();
      if (now - lastRadarCheckRef.current < 45_000) return;
      lastRadarCheckRef.current = now;

      try {
        const storedHistory = loadHistory();
        const storedEvents = loadEvents();
        const savedThreshold = Number(window.localStorage.getItem("radar-threshold"));
        const threshold = [60, 70, 80].includes(savedThreshold) ? savedThreshold : 70;
        const openIds = storedHistory.filter((h) => h.status === "open").map((h) => h.id);
        const url = `/api/market/pump-radar${openIds.length ? `?track=${encodeURIComponent(openIds.join(","))}` : ""}`;

        const res = await fetch(url);
        if (!res.ok) return;
        const payload = (await res.json()) as RadarPayload;
        const ts = Date.now();

        const evaluated = evaluateHistory(storedHistory, payload.prices ?? {}, ts);
        const { history: progressed, events: progressEvs } = trackProgress(
          storedHistory,
          evaluated,
          payload.prices ?? {},
          ts
        );
        const { history: nextHistory, fresh } = addAlerts(progressed, payload.coins, threshold, ts);
        saveHistory(nextHistory);

        const freshEvs = alertEvents(fresh, ts);
        const incoming = [...freshEvs, ...progressEvs];
        if (incoming.length > 0) {
          saveEvents([...incoming, ...storedEvents].slice(0, MAX_EVENTS));
          incoming.slice(0, 3).forEach((ev) => {
            if (ev.tone === "good") {
              toast.success(ev.title, { description: ev.message, duration: 9000 });
            } else if (ev.tone === "bad") {
              toast.error(ev.title, { description: ev.message, duration: 9000 });
            }
            if (ev.notify) {
              void showSystemNotification(ev.title, ev.message, ev.id);
            }
          });
        }
      } catch {
        // Ağ hatasını sessizce geç
      }
    };

    // 2) Klasik backend pump-alerts (eğer yerel/Render backend açıksa)
    const fetchBackendAlerts = async () => {
      try {
        const res = await fetch(`${API_URL}/api/market/pump-alerts?min_change=1.5&limit=50`);
        if (res.ok) {
          const alerts: PumpAlert[] = await res.json();
          const now = Date.now();

          alerts.forEach((alert) => {
            const lastAlertTime = alertedSymbols.current.get(alert.symbol);
            if (!lastAlertTime || now - lastAlertTime > 15 * 60 * 1000) {
              alertedSymbols.current.set(alert.symbol, now);

              const isPump = alert.type === "pump";
              const isExtreme = alert.intensity === "extreme";
              const title = isPump
                ? isExtreme
                  ? "🚀 DEV YÜKSELİŞ"
                  : "📈 Yükseliş Başladı"
                : isExtreme
                  ? "🩸 DEV ÇÖKÜŞ"
                  : "📉 Düşüş Başladı";
              const baseName = alert.symbol.replace("USDT", "");

              void showSystemNotification(
                `${title}: ${baseName}/USDT (${isPump ? "+" : ""}${alert.change_5m.toFixed(2)}%)`,
                `Fiyat $${formatPrice(alert.price)} · Son 5 dk hacim ${alert.vol_spike.toFixed(1)}x`,
                `pump-${alert.symbol}`
              );

              toast.custom(
                (t) => (
                  <div
                    className={`
                      w-[320px] p-4 rounded-xl border backdrop-blur-xl shadow-2xl cursor-pointer transition-all hover:scale-[1.02]
                      ${
                        isPump
                          ? "bg-emerald-950/80 border-emerald-500/50 shadow-emerald-900/20"
                          : "bg-rose-950/80 border-rose-500/50 shadow-rose-900/20"
                      }
                    `}
                    onClick={() => {
                      toast.dismiss(t);
                      setSymbol(alert.symbol);
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-1.5 rounded-lg ${
                            isPump ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"
                          }`}
                        >
                          {isExtreme ? (
                            <Flame size={16} className="animate-pulse" />
                          ) : isPump ? (
                            <TrendingUp size={16} />
                          ) : (
                            <TrendingDown size={16} />
                          )}
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-bold tracking-wider text-gray-300">{title}</div>
                          <span className="font-bold text-white text-base">{baseName}</span>
                          <span className="text-[10px] text-gray-400 ml-1">/USDT</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-black ${isPump ? "text-emerald-400" : "text-rose-400"}`}>
                          {isPump ? "+" : ""}
                          {alert.change_5m.toFixed(2)}%
                        </div>
                        <div className="text-[9px] text-gray-400">Son 5 dk</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs mt-3 bg-black/20 p-2 rounded-lg border border-white/5">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-gray-500 uppercase">Fiyat</span>
                        <span className="font-mono text-gray-200">${formatPrice(alert.price)}</span>
                      </div>
                      {alert.vol_spike > 1.5 && (
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] text-gray-500 uppercase flex items-center gap-1">
                            <Zap size={8} className="text-yellow-400" />
                            Hacim
                          </span>
                          <span className="font-bold text-yellow-400">{alert.vol_spike.toFixed(1)}x Artış</span>
                        </div>
                      )}
                    </div>
                  </div>
                ),
                { duration: isExtreme ? 8000 : 5000 }
              );
            }
          });
        }
      } catch {
        // Backend ulaşılamazsa sessizce geç
      }
    };

    const runAll = () => {
      void pollRadarBackground();
      void fetchBackendAlerts();
    };

    runAll();
    const interval = setInterval(runAll, 60_000);

    // Mobil ekran kilidi açıldığında veya sekmeye dönüldüğünde anında kontrol et
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void pollRadarBackground();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [setSymbol]);

  return null;
}
