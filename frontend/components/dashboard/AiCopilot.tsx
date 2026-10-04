"use client";

import { useEffect, useState } from "react";
import { Bot, Sparkles, Target, ShieldAlert, Crosshair } from "lucide-react";
import { useDashboardStore } from "@/lib/store";

const formatPrice = (p: number) => {
  if (p < 0.001) return "$" + p.toFixed(6);
  if (p < 1) return "$" + p.toFixed(4);
  if (p < 10) return "$" + p.toFixed(3);
  return "$" + p.toFixed(2);
};

export default function AiCopilot() {
  const activeSymbol = useDashboardStore((s) => s.activeSymbol);
  const signalData = useDashboardStore((s) => s.signalData);
  const candles = useDashboardStore((s) => s.candles);

  const [advice, setAdvice] = useState<{
    text: string;
    action: "BUY" | "SELL" | "WAIT";
    type: "bullish" | "bearish" | "neutral" | "warning";
    entry?: number;
    target?: number;
    stopLoss?: number;
    confidence: number;
  } | null>(null);

  useEffect(() => {
    // Generate AI advice based on real-time signal and candle data
    if (!signalData || candles.length === 0) {
      setAdvice({
        text: `${activeSymbol.replace("USDT", "")} için piyasa verileri analiz ediliyor... Lütfen bekleyin.`,
        action: "WAIT",
        type: "neutral",
        confidence: 0
      });
      return;
    }

    const sig = signalData;
    const price = sig.price;
    const ind = sig.indicators;
    const rsi = ind.rsi ?? 50;
    const score = sig.score;
    
    // Dynamic Support / Resistance mapping
    const vwap = ind.vwap;
    const bbUpper = ind.bb_upper;
    const bbLower = ind.bb_lower;
    const ema200 = ind.ema_200;
    
    let entry: number | undefined;
    let target: number | undefined;
    let stopLoss: number | undefined;
    let text = "";
    let action: "BUY" | "SELL" | "WAIT" = "WAIT";
    let type: "bullish" | "bearish" | "neutral" | "warning" = "neutral";
    let confidence = 50;

    // Last candle volume check
    const lastCandle = candles[candles.length - 1];
    const lastVolume = lastCandle.volume;
    const avgVolume = candles.slice(Math.max(0, candles.length - 11), candles.length - 1)
      .reduce((sum, c) => sum + c.volume, 0) / 10 || 1;
    const volSpike = lastVolume > avgVolume * 1.5;

    // Mathematical safety constraints for supports/resistances
    const safeSupport = bbLower ? Math.min(price * 0.99, bbLower) : price * 0.98;
    const safeResistance = bbUpper ? Math.max(price * 1.01, bbUpper) : price * 1.02;

    // AI Logic Engine
    if (score >= 65) {
      action = "BUY";
      type = "bullish";
      confidence = score;
      entry = price; // Trend is strong, enter at market
      target = safeResistance;
      stopLoss = safeSupport;
      
      if (volSpike) {
        text = `Hacim patlamasıyla birlikte güçlü AL sinyali. Hedef noktasına doğru ivmelenme başladı.`;
      } else {
        text = `Trend pozitif yönde. Mevcut fiyattan giriş yapılabilir. Stop-loss kurmayı unutmayın.`;
      }
    } else if (score <= 35) {
      action = "SELL";
      type = "bearish";
      confidence = 100 - score;
      entry = price; // Short entry or spot exit
      target = safeSupport;
      stopLoss = safeResistance;
      
      if (volSpike) {
        text = `Büyük bir satış dalgası var (Hacimli Düşüş). Bıçak düşerken tutulmaz. Zararı kesip nakite geçmek için son fırsatlar.`;
      } else {
        text = `Satış baskısı hakim ve teknik göstergeler zayıf. Düşüş hedeflere kadar sürebilir (Short fırsatı).`;
      }
    } else if (rsi >= 75) {
      action = "SELL";
      type = "warning";
      confidence = 80;
      entry = price;
      target = safeSupport;
      stopLoss = safeResistance;
      text = `⚠️ Fiyat aşırı şişti (RSI > 75). Kâr satışı gelme olasılığı çok yüksek. Elinizdekileri satmayı düşünün.`;
    } else if (rsi <= 25) {
      action = "BUY";
      type = "bullish";
      confidence = 75;
      entry = price;
      target = safeResistance;
      stopLoss = safeSupport;
      text = `Aşırı satım bölgesinde (RSI dipte). Tepki alımı gelmesi bekleniyor. Risk/ödül oranı açısından cazip bir GİRİŞ fırsatı.`;
    } else {
      action = "WAIT";
      type = "neutral";
      confidence = 50;
      entry = (vwap && vwap < price) ? vwap : price * 0.995; // Buy on dip
      target = safeResistance;
      stopLoss = safeSupport;
      text = `Piyasa şu an yatay. Kırılım yönü belli değil. Geri çekilmelerde (Alt bant veya VWAP) alım fırsatı kollanabilir.`;
    }

    // STRICT LOGIC ENFORCEMENT (Prevents any logical errors on the UI)
    if (action === "BUY" || action === "WAIT") {
      // Long Trade Logic
      if (target <= entry) target = entry * 1.02; // Target must be strictly higher
      if (stopLoss >= entry) stopLoss = entry * 0.98; // Stop must be strictly lower
    } else if (action === "SELL") {
      // Short Trade Logic
      if (target >= entry) target = entry * 0.98; // Target must be strictly lower
      if (stopLoss <= entry) stopLoss = entry * 1.02; // Stop must be strictly higher
    }

    setAdvice({ text, action, type, entry, target, stopLoss, confidence });

  }, [activeSymbol, signalData, candles]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isClosed, setIsClosed] = useState(false);

  if (!advice) return null;

  // We will map the CSS variables to Tailwind classes dynamically based on the advice type.
  const theme = {
    bullish: {
      card: "from-[#0d2617] to-[#0a1c12]",
      line: "border-[#20432b]",
      iconBg: "bg-[#0f2f1e]",
      iconColor: "text-[#2fd6a1]",
      ink: "text-[#e9f6ed]",
      inkDim: "text-[#87a991]",
      crimsonGrad: "from-[#2fd6a1] to-[#18c28b]",
      crimsonBtn: "bg-gradient-to-br from-[#2fd6a1] to-[#18c28b]",
      shadow: "shadow-[0_30px_60px_-30px_rgba(47,214,161,0.35)]",
      tagBg: "bg-[#2fd6a1]/10 border-[#2fd6a1]/30 text-[#2fd6a1]",
      tagText: "LONG FIRSATI",
      trackWin: "from-[#2fd6a1]/15 to-[#2fd6a1]",
      trackLose: "from-[#ff5a6e] to-[#ff5a6e]/15",
      dirText: "Long",
      btnText: advice.action === "BUY" ? "GİRİŞ YAP" : "BEKLE",
    },
    bearish: {
      card: "from-[#260d15] to-[#1c0a10]",
      line: "border-[#43202b]",
      iconBg: "bg-[#2f0f19]",
      iconColor: "text-[#ff3b5c]",
      ink: "text-[#f6e9ec]",
      inkDim: "text-[#a98791]",
      crimsonGrad: "from-[#c2183a] to-[#ff3b5c]",
      crimsonBtn: "bg-gradient-to-br from-[#ff3b5c] to-[#c2183a]",
      shadow: "shadow-[0_30px_60px_-30px_rgba(255,59,92,0.35)]",
      tagBg: "bg-[#ff5a6e]/10 border-[#ff5a6e]/30 text-[#ff5a6e]",
      tagText: "SHORT FIRSATI",
      trackWin: "from-[#2fd6a1]/15 to-[#2fd6a1]",
      trackLose: "from-[#ff5a6e] to-[#ff5a6e]/15",
      dirText: "Short",
      btnText: advice.action === "SELL" ? "ÇIKIŞ YAP" : "BEKLE",
    },
    warning: {
      card: "from-[#291c0b] to-[#1f1508]",
      line: "border-[#4a3314]",
      iconBg: "bg-[#33220d]",
      iconColor: "text-[#f59e0b]",
      ink: "text-[#fef3c7]",
      inkDim: "text-[#d97706]",
      crimsonGrad: "from-[#d97706] to-[#f59e0b]",
      crimsonBtn: "bg-gradient-to-br from-[#f59e0b] to-[#d97706]",
      shadow: "shadow-[0_30px_60px_-30px_rgba(245,158,11,0.35)]",
      tagBg: "bg-[#f59e0b]/10 border-[#f59e0b]/30 text-[#f59e0b]",
      tagText: "DİKKAT",
      trackWin: "from-[#2fd6a1]/15 to-[#2fd6a1]",
      trackLose: "from-[#ff5a6e] to-[#ff5a6e]/15",
      dirText: "Riskli",
      btnText: "ÇIKIŞ YAP",
    },
    neutral: {
      card: "from-[#111827] to-[#0f172a]",
      line: "border-[#334155]",
      iconBg: "bg-[#1e293b]",
      iconColor: "text-[#818cf8]",
      ink: "text-[#f8fafc]",
      inkDim: "text-[#94a3b8]",
      crimsonGrad: "from-[#4f46e5] to-[#818cf8]",
      crimsonBtn: "bg-gradient-to-br from-[#818cf8] to-[#4f46e5]",
      shadow: "shadow-[0_30px_60px_-30px_rgba(129,140,248,0.35)]",
      tagBg: "bg-[#818cf8]/10 border-[#818cf8]/30 text-[#818cf8]",
      tagText: "YATAY PİYASA",
      trackWin: "from-[#2fd6a1]/15 to-[#2fd6a1]",
      trackLose: "from-[#ff5a6e] to-[#ff5a6e]/15",
      dirText: "Nötr",
      btnText: "İZLE",
    }
  };

  const t = theme[advice.type];

  const handleActionClick = () => {
    setConfirmOpen(true);
  };

  const confirmAction = () => {
    setConfirmOpen(false);
    setIsClosed(true);
  };

  const cancelAction = () => {
    setConfirmOpen(false);
  };

  // Calculate percentages for the track pins
  let entryPos = "50%";
  let targetPos = "0%";
  let stopPos = "100%";
  let targetVal = advice.target || 0;
  let entryVal = advice.entry || 0;
  let stopVal = advice.stopLoss || 0;

  if (entryVal && targetVal && stopVal) {
    const totalRange = Math.abs(stopVal - targetVal);
    if (totalRange > 0) {
      if (advice.type === "bullish" || advice.type === "neutral") {
        // Bullish: Stop is lower, Target is higher
        // Track visual: left is stop (red), right is target (green)
        // Actually, the HTML scale has green on left, red on right. Let's adapt.
      }
    }
  }

  // To match the HTML exactly: 
  // track .win { background: linear-gradient(90deg, rgba(47,214,161,.15), var(--gain)); }
  // track .lose { background: linear-gradient(90deg, var(--loss), rgba(255,90,110,.15)); }

  return (
    <div className={`@container w-full max-w-[420px] bg-gradient-to-br ${t.card} border ${t.line} rounded-[22px] p-4 @sm:p-5 flex flex-col gap-4 @sm:gap-[18px] ${t.shadow} font-sans`}>
      
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3">
        <div className={`flex-none w-11 h-11 rounded-[13px] flex items-center justify-center ${t.iconBg} border ${t.line} ${t.iconColor}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="8" width="16" height="11" rx="3"/>
            <path d="M12 8V4M9 13h.01M15 13h.01M9 16.5h6"/>
            <circle cx="12" cy="3.5" r="1"/>
          </svg>
        </div>
        
        <div className="flex-1 min-w-0">
          <h1 className={`m-0 text-base tracking-[0.06em] font-bold ${t.ink} uppercase font-sora`}>AI COPILOT</h1>
          <div className="flex items-center gap-2 mt-1.5">
            <small className={`text-[10px] tracking-[0.14em] ${t.inkDim} uppercase whitespace-nowrap`}>Güven skoru</small>
            <div className="flex-1 min-w-[40px] h-1.5 rounded-full bg-black/40 overflow-hidden">
              <div 
                className={`h-full w-[42%] rounded-full bg-gradient-to-r ${t.crimsonGrad} transition-all duration-1000`} 
                style={{ width: `${advice.confidence}%` }}
              />
            </div>
            <b className={`font-mono text-xs font-semibold ${t.ink}`}>{advice.confidence}%</b>
          </div>
        </div>

        {!confirmOpen && !isClosed && (
          <button 
            onClick={handleActionClick}
            className={`w-full @[320px]:w-auto flex-none border-0 cursor-pointer text-white font-bold text-[13px] leading-[1.15] tracking-[0.04em] uppercase px-4 py-2.5 rounded-xl ${t.crimsonBtn} transition-transform hover:brightness-110 active:scale-97 font-sora`}
          >
            {t.btnText.split(' ').map((word, i) => <span key={i}>{word}<br className="hidden @[320px]:block" /></span>)}
          </button>
        )}
      </header>

      {/* Confirm / Status Actions */}
      {confirmOpen && (
        <div className={`flex items-center gap-2 flex-wrap text-[13px] ${t.inkDim}`}>
          <span>İşlem onaylansın mı?</span>
          <button onClick={confirmAction} className={`font-semibold text-xs rounded-[9px] px-3 py-1.5 cursor-pointer border ${t.crimsonBtn} text-white`}>Evet</button>
          <button onClick={cancelAction} className={`font-semibold text-xs rounded-[9px] px-3 py-1.5 cursor-pointer border ${t.line} bg-transparent ${t.ink}`}>Vazgeç</button>
        </div>
      )}
      {isClosed && (
        <div className="text-[13px] text-[#2fd6a1]">
          İşlem gerçekleştirildi.
        </div>
      )}

      {/* Insight Box */}
      <section className={`border ${t.line} bg-black/20 rounded-2xl p-3.5 flex flex-col gap-2.5`}>
        <span className={`self-start inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.12em] px-2.5 py-1 rounded-full border ${t.tagBg}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
            {advice.type === 'bullish' ? (
              <path d="M4 18l6-6 4 4 6-6 M20 16v-6h-6" />
            ) : (
              <>
                <path d="M4 6l6 6 4-4 6 6"/>
                <path d="M20 10v4h-4"/>
              </>
            )}
          </svg>
          {t.tagText}
        </span>
        <p className={`m-0 text-[13px] @sm:text-[14px] leading-[1.55] ${t.ink}`}>
          {advice.text}
        </p>
      </section>

      {/* Scale Track */}
      {(advice.entry || advice.target || advice.stopLoss) && (
        <section className="flex flex-col gap-2">
          <h2 className={`m-0 text-[10px] tracking-[0.14em] uppercase ${t.inkDim} font-semibold`}>Hedeften stopa fiyat aralığı</h2>
          <div className="relative h-2.5 rounded-full overflow-hidden flex">
            <div className={`flex-1 bg-gradient-to-r ${t.trackWin}`} />
            <div className={`flex-1 bg-gradient-to-r ${t.trackLose}`} />
          </div>
          <div className={`relative h-4 font-mono text-[9px] @sm:text-[10px] ${t.inkDim}`}>
            <span className="absolute left-0">{formatPrice(advice.target || 0)}</span>
            <span className="absolute left-1/2 -translate-x-1/2">{formatPrice(advice.entry || 0)}</span>
            <span className="absolute left-full -translate-x-full">{formatPrice(advice.stopLoss || 0)}</span>
          </div>
        </section>
      )}

      {/* Levels Grid */}
      {(advice.entry || advice.target || advice.stopLoss) && (
        <section className="grid grid-cols-3 gap-2 @sm:gap-2.5">
          <div className={`bg-black/30 border ${t.line} rounded-[14px] p-2 @sm:p-3 flex flex-col gap-1.5 @sm:gap-2 min-w-0`}>
            <label className="flex items-center gap-1 @sm:gap-1.5 text-[9px] @sm:text-[10px] tracking-[0.12em] uppercase font-semibold text-[#6aa8ff]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5 flex-none hidden @[250px]:block">
                <circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
              </svg>
              Giriş
            </label>
            <output className={`font-mono text-[14px] @sm:text-[17px] font-semibold tabular-nums ${t.ink}`}>
              {formatPrice(advice.entry || 0)}
            </output>
            <small className={`font-mono text-[10px] @sm:text-[11px] ${t.inkDim}`}>Referans</small>
          </div>

          <div className={`bg-black/30 border ${t.line} rounded-[14px] p-2 @sm:p-3 flex flex-col gap-1.5 @sm:gap-2 min-w-0`}>
            <label className="flex items-center gap-1 @sm:gap-1.5 text-[9px] @sm:text-[10px] tracking-[0.12em] uppercase font-semibold text-[#2fd6a1]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 flex-none hidden @[250px]:block">
                <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>
              </svg>
              Hedef
            </label>
            <output className={`font-mono text-[14px] @sm:text-[17px] font-semibold tabular-nums ${t.ink}`}>
              {formatPrice(advice.target || 0)}
            </output>
            <small className={`font-mono text-[10px] @sm:text-[11px] ${t.inkDim}`}>
              {advice.target && advice.entry ? (
                `${((advice.target - advice.entry) / advice.entry * 100).toFixed(2)}%`
              ) : '-'}
            </small>
          </div>

          <div className={`bg-black/30 border ${t.line} rounded-[14px] p-2 @sm:p-3 flex flex-col gap-1.5 @sm:gap-2 min-w-0`}>
            <label className="flex items-center gap-1 @sm:gap-1.5 text-[9px] @sm:text-[10px] tracking-[0.12em] uppercase font-semibold text-[#ff5a6e]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="w-3.5 h-3.5 flex-none hidden @[250px]:block">
                <path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M12 9v4M12 16h.01" strokeLinecap="round"/>
              </svg>
              Stop
            </label>
            <output className={`font-mono text-[14px] @sm:text-[17px] font-semibold tabular-nums ${t.ink}`}>
              {formatPrice(advice.stopLoss || 0)}
            </output>
            <small className={`font-mono text-[10px] @sm:text-[11px] ${t.inkDim}`}>
              {advice.stopLoss && advice.entry ? (
                `${((advice.stopLoss - advice.entry) / advice.entry * 100).toFixed(2)}%`
              ) : '-'}
            </small>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className={`flex justify-between gap-3 flex-wrap text-[11px] @sm:text-xs ${t.inkDim} border-t border-dashed ${t.line} pt-3.5`}>
        <span>Risk / Ödül <b className={`font-mono ${t.ink} font-semibold`}>1 : 1</b></span>
        <span>Yön <b className={`font-mono ${t.ink} font-semibold`}>{t.dirText}</b></span>
      </footer>

    </div>
  );
}
