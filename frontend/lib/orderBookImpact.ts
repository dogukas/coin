// Emir Defteri Fiyat Etkisi (Order Book Price Impact & Liquidity Wall) Analiz Motoru
// Mevcut yapıyı bozmadan hem CandlestickChart (fiyat çizgileri + üst özet) hem de DepthChart / OrderBook içinde kullanılır.

export interface BookWall {
  price: number;
  qty: number;
  usd: number;
  /** Orta fiyata olan uzaklık (%) */
  distancePct: number;
  side: "bid" | "ask";
}

export interface PriceImpactAnalysis {
  midPrice: number;
  spreadPct: number;
  totalBidUsd: number;
  totalAskUsd: number;
  /** 0-100 arası alış tarafı ağırlığı (%) */
  bidSharePct: number;
  /** Simüle edilen piyasa emri büyüklüğü ($) */
  sampleOrderUsd: number;
  /** sampleOrderUsd tutarında piyasa ALIMI yapılırsa fiyatın ulaşacağı seviye */
  buyReachPrice: number;
  /** sampleOrderUsd tutarında piyasa ALIMI yapılırsa fiyatın % yükseliş etkisi */
  buyImpactPct: number;
  /** sampleOrderUsd tutarında piyasa SATIŞI yapılırsa fiyatın ineceği seviye */
  sellReachPrice: number;
  /** sampleOrderUsd tutarında piyasa SATIŞI yapılırsa fiyatın % düşüş etkisi */
  sellImpactPct: number;
  /** >1 ise yukarı hareket daha kolay (satış duvarı ince, alış desteği kalın); <1 ise aşağı hareket daha kolay */
  upwardEaseRatio: number;
  /** Fiyat üzerindeki net emir defteri etkisi yönü */
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  /** Kullanıcıya tek bakışta durumu anlatan net Türkçe özet */
  summaryText: string;
  /** Kısa rozet metni */
  shortBadge: string;
  topBidWall: BookWall | null;
  topAskWall: BookWall | null;
}

type RawBookRow = readonly [string | number, string | number];

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function analyzeOrderBookImpact(
  rawBids: ReadonlyArray<RawBookRow>,
  rawAsks: ReadonlyArray<RawBookRow>
): PriceImpactAnalysis | null {
  const bids = rawBids
    .map(([p, q]) => ({ price: Number(p), qty: Number(q), usd: Number(p) * Number(q) }))
    .filter((x) => Number.isFinite(x.price) && Number.isFinite(x.qty) && x.price > 0 && x.qty > 0)
    .sort((a, b) => b.price - a.price); // en iyi alış (en yüksek fiyat) başta

  const asks = rawAsks
    .map(([p, q]) => ({ price: Number(p), qty: Number(q), usd: Number(p) * Number(q) }))
    .filter((x) => Number.isFinite(x.price) && Number.isFinite(x.qty) && x.price > 0 && x.qty > 0)
    .sort((a, b) => a.price - b.price); // en iyi satış (en düşük fiyat) başta

  if (bids.length === 0 || asks.length === 0) return null;

  const bestBid = bids[0].price;
  const bestAsk = asks[0].price;
  const midPrice = (bestBid + bestAsk) / 2;
  if (midPrice <= 0) return null;

  const spreadPct = ((bestAsk - bestBid) / midPrice) * 100;
  const totalBidUsd = bids.reduce((acc, b) => acc + b.usd, 0);
  const totalAskUsd = asks.reduce((acc, a) => acc + a.usd, 0);
  const totalBookUsd = totalBidUsd + totalAskUsd;
  const bidSharePct = totalBookUsd > 0 ? (totalBidUsd / totalBookUsd) * 100 : 50;

  // Balina duvarı tespiti (medyan kademenin en az 3.2 katı olan en büyük alış ve satış kademesi)
  const allUsd = [...bids.map((b) => b.usd), ...asks.map((a) => a.usd)];
  const medUsd = median(allUsd);
  const wallThreshold = Math.max(medUsd * 3.2, totalBookUsd * 0.06, 2_500);

  let topBidWall: BookWall | null = null;
  for (const b of bids) {
    if (b.usd >= wallThreshold && (!topBidWall || b.usd > topBidWall.usd)) {
      topBidWall = {
        price: b.price,
        qty: b.qty,
        usd: b.usd,
        distancePct: ((midPrice - b.price) / midPrice) * 100,
        side: "bid",
      };
    }
  }

  let topAskWall: BookWall | null = null;
  for (const a of asks) {
    if (a.usd >= wallThreshold && (!topAskWall || a.usd > topAskWall.usd)) {
      topAskWall = {
        price: a.price,
        qty: a.qty,
        usd: a.usd,
        distancePct: ((a.price - midPrice) / midPrice) * 100,
        side: "ask",
      };
    }
  }

  // Dinamik piyasa emri büyüklüğü (defter derinliğinin ~%40'ı, standart yuvarlanmış dilim)
  const rawTargetUsd = Math.min(totalBidUsd, totalAskUsd) * 0.45;
  const stdBuckets = [5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
  let sampleOrderUsd = stdBuckets[0];
  for (const bucket of stdBuckets) {
    if (rawTargetUsd >= bucket * 0.75) sampleOrderUsd = bucket;
  }
  if (rawTargetUsd < 5_000) {
    sampleOrderUsd = Math.max(1_000, Math.round(rawTargetUsd / 500) * 500 || 1_000);
  }

  // Alım Fiyat Etkisi (Asks yukarı taranır)
  let remBuy = sampleOrderUsd;
  let buyReachPrice = bestAsk;
  for (const a of asks) {
    buyReachPrice = a.price;
    if (remBuy <= a.usd) {
      remBuy = 0;
      break;
    }
    remBuy -= a.usd;
  }
  // Eğer emir tüm görünür tahtayı aşıyorsa kalan kısmı son kademe eğimiyle tahmin et
  if (remBuy > 0 && totalAskUsd > 0) {
    const extraRatio = remBuy / totalAskUsd;
    const span = Math.max(asks[asks.length - 1].price - bestAsk, midPrice * 0.001);
    buyReachPrice = asks[asks.length - 1].price + span * extraRatio;
  }
  const buyImpactPct = Math.max(0.005, ((buyReachPrice - midPrice) / midPrice) * 100);

  // Satış Fiyat Etkisi (Bids aşağı taranır)
  let remSell = sampleOrderUsd;
  let sellReachPrice = bestBid;
  for (const b of bids) {
    sellReachPrice = b.price;
    if (remSell <= b.usd) {
      remSell = 0;
      break;
    }
    remSell -= b.usd;
  }
  if (remSell > 0 && totalBidUsd > 0) {
    const extraRatio = remSell / totalBidUsd;
    const span = Math.max(bestBid - bids[bids.length - 1].price, midPrice * 0.001);
    sellReachPrice = Math.max(midPrice * 0.5, bids[bids.length - 1].price - span * extraRatio);
  }
  const sellImpactPct = Math.max(0.005, ((midPrice - sellReachPrice) / midPrice) * 100);

  // Direncin en az olduğu yön: buyImpactPct > sellImpactPct ise aynı dolarla fiyat yukarı daha çok gider (satış duvarı ince, alış kalın)
  const upwardEaseRatio = Number((buyImpactPct / sellImpactPct).toFixed(2));

  let direction: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let summaryText = "Alış ve satış derinliği dengeli; fiyat etkisi çift yönlü simetrik.";
  let shortBadge = "Dengeli Etki";

  if (bidSharePct >= 55 || upwardEaseRatio >= 1.25) {
    direction = "BULLISH";
    const factor = Math.max(upwardEaseRatio, Number((totalBidUsd / Math.max(1, totalAskUsd)).toFixed(1)));
    shortBadge = `Yukarı Etki ${factor.toFixed(1)}x Kolay`;
    summaryText = `Alış desteği güçlü (%${bidSharePct.toFixed(0)}). Satış kademeleri daha ince olduğu için alımların fiyatı yukarı taşıma etkisi ${factor.toFixed(1)}x daha yüksek.`;
  } else if (bidSharePct <= 45 || upwardEaseRatio <= 0.8) {
    direction = "BEARISH";
    const factor = Math.max(
      Number((1 / Math.max(0.1, upwardEaseRatio)).toFixed(1)),
      Number((totalAskUsd / Math.max(1, totalBidUsd)).toFixed(1))
    );
    shortBadge = `Aşağı Baskı ${factor.toFixed(1)}x Ağır`;
    summaryText = `Satış kademeleri baskın (%${(100 - bidSharePct).toFixed(0)}). Alış desteği ince olduğu için satışların fiyatı aşağı çekme etkisi ${factor.toFixed(1)}x daha yüksek.`;
  }

  return {
    midPrice,
    spreadPct: Number(spreadPct.toFixed(4)),
    totalBidUsd: Math.round(totalBidUsd),
    totalAskUsd: Math.round(totalAskUsd),
    bidSharePct: Number(bidSharePct.toFixed(1)),
    sampleOrderUsd,
    buyReachPrice,
    buyImpactPct: Number(buyImpactPct.toFixed(3)),
    sellReachPrice,
    sellImpactPct: Number(sellImpactPct.toFixed(3)),
    upwardEaseRatio,
    direction,
    summaryText,
    shortBadge,
    topBidWall,
    topAskWall,
  };
}

