"""
CoinGecko Service — Temel Piyasa Bilgileri
==========================================
Sadece şunları çeker:
  - Coin logoları (image URL)
  - Piyasa değeri (market_cap)
  - Dolaşımdaki arz (circulating_supply)
  - Kategori bilgisi
  - Trend coinler

Tamamen izole. Binance servisine dokunmaz.
Cache süresi: 5 dakika (CoinGecko ücretsiz limit: dakikada 30 istek)
"""

import aiohttp
import logging
import time
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# CoinGecko ücretsiz API base URL
COINGECKO_BASE = "https://api.coingecko.com/api/v3"

# Cache (TTL saniye cinsinden)
TTL_MARKETS   = 300   # 5 dakika — coin listesi
TTL_TRENDING  = 300   # 5 dakika — trend coinler
TTL_CATEGORIES = 600  # 10 dakika — kategoriler nadiren değişir

# Binance sembolü → CoinGecko id eşleştirme (en yaygın 60 coin)
SYMBOL_TO_GECKO_ID: Dict[str, str] = {
    "BTCUSDT": "bitcoin", "ETHUSDT": "ethereum", "BNBUSDT": "binancecoin",
    "SOLUSDT": "solana", "XRPUSDT": "ripple", "ADAUSDT": "cardano",
    "AVAXUSDT": "avalanche-2", "DOTUSDT": "polkadot", "MATICUSDT": "matic-network",
    "LINKUSDT": "chainlink", "UNIUSDT": "uniswap", "LTCUSDT": "litecoin",
    "ATOMUSDT": "cosmos", "ETCUSDT": "ethereum-classic", "XLMUSDT": "stellar",
    "NEARUSDT": "near", "FTMUSDT": "fantom", "ALGOUSDT": "algorand",
    "VETUSDT": "vechain", "ICPUSDT": "internet-computer", "FILUSDT": "filecoin",
    "AAVEUSDT": "aave", "MKRUSDT": "maker", "COMPUSDT": "compound-governance-token",
    "SUSHIUSDT": "sushi", "CAKEUSDT": "pancakeswap-token", "1INCHUSDT": "1inch",
    "DOGEUSDT": "dogecoin", "SHIBUSDT": "shiba-inu", "PEPEUSDT": "pepe",
    "WIFUSDT": "dogwifcoin", "FLOKIUSDT": "floki", "BONKUSDT": "bonk",
    "ARBUSDT": "arbitrum", "OPUSDT": "optimism", "INJUSDT": "injective-protocol",
    "APTUSDT": "aptos", "SUIUSDT": "sui", "SEIUSDT": "sei-network",
    "TIAUSDT": "celestia", "JUPUSDT": "jupiter-exchange-solana",
    "ONDOUSDT": "ondo-finance", "RENDERUSDT": "render-token",
    "FETUSDT": "fetch-ai", "AGIXUSDT": "singularitynet",
    "WLDUSDT": "worldcoin-wld", "TAOUSDT": "bittensor",
    "TRXUSDT": "tron", "TONUSDT": "the-open-network",
    "SANDUSDT": "the-sandbox", "MANAUSDT": "decentraland",
    "AXSUSDT": "axie-infinity", "GRTUSDT": "the-graph",
    "APEUSDT": "apecoin", "LDOUSDT": "lido-dao",
    "STRKUSDT": "starknet", "ZKSYNCUSDT": "zksync",
    "ENAUSDT": "ethena", "EIGENUSDT": "eigenlayer",
}


class CoinGeckoService:
    """CoinGecko'dan temel piyasa verilerini çeker. İzole ve önbellekli."""

    def __init__(self):
        self._session: Optional[aiohttp.ClientSession] = None
        self._cache: Dict[str, dict] = {}

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=12),
                headers={"Accept": "application/json", "User-Agent": "crypto-dashboard/1.0"}
            )
        return self._session

    def _cached(self, key: str, ttl: int):
        """Cache'den veri döner, süresi dolmuşsa None."""
        entry = self._cache.get(key)
        if entry and time.time() - entry["ts"] < ttl:
            return entry["data"]
        return None

    def _store(self, key: str, data):
        self._cache[key] = {"data": data, "ts": time.time()}

    # ──────────────────────────────────────────
    # 1. TOP 250 COİN — Logo + Market Cap + Arz
    # ──────────────────────────────────────────

    async def fetch_market_data(self, page: int = 1, per_page: int = 250) -> List[dict]:
        """
        CoinGecko /coins/markets
        Döndürür: id, symbol, image, market_cap, market_cap_rank,
                  circulating_supply, total_supply, ath, ath_change_percentage
        Cache: 5 dakika
        """
        key = f"markets_p{page}_{per_page}"
        cached = self._cached(key, TTL_MARKETS)
        if cached is not None:
            return cached

        url = f"{COINGECKO_BASE}/coins/markets"
        params = {
            "vs_currency": "usd",
            "order": "market_cap_desc",
            "per_page": per_page,
            "page": page,
            "sparkline": "false",
            "price_change_percentage": "24h",
        }

        try:
            session = await self._get_session()
            async with session.get(url, params=params) as resp:
                if resp.status == 200:
                    raw = await resp.json()
                    # Sadece ihtiyacımız olan alanları al — temiz ve hafif
                    result = [
                        {
                            "coingecko_id": c["id"],
                            "symbol": c["symbol"].upper() + "USDT",
                            "image": c["image"],
                            "market_cap": c.get("market_cap") or 0,
                            "market_cap_rank": c.get("market_cap_rank") or 9999,
                            "circulating_supply": c.get("circulating_supply") or 0,
                            "total_supply": c.get("total_supply") or 0,
                            "ath": c.get("ath") or 0,
                            "ath_change_pct": round(c.get("ath_change_percentage") or 0, 2),
                        }
                        for c in raw
                        if c.get("id") and c.get("symbol")
                    ]
                    self._store(key, result)
                    logger.info(f"CoinGecko: {len(result)} coin verisi alındı")
                    return result
                elif resp.status == 429:
                    logger.warning("CoinGecko rate limit! 60s beklenecek.")
                else:
                    logger.warning(f"CoinGecko markets: HTTP {resp.status}")
        except Exception as e:
            logger.error(f"CoinGecko market_data hatası: {e}")

        return self._cached(key, 9999) or []  # Hata durumunda eski cache

    # ──────────────────────────────────────────
    # 2. TREND COİNLER
    # ──────────────────────────────────────────

    async def fetch_trending(self) -> List[dict]:
        """
        CoinGecko /search/trending
        Son 24 saatte en çok aranan 7 coin.
        Cache: 5 dakika
        """
        key = "trending"
        cached = self._cached(key, TTL_TRENDING)
        if cached is not None:
            return cached

        url = f"{COINGECKO_BASE}/search/trending"
        try:
            session = await self._get_session()
            async with session.get(url) as resp:
                if resp.status == 200:
                    raw = await resp.json()
                    result = []
                    for item in raw.get("coins", []):
                        c = item.get("item", {})
                        result.append({
                            "coingecko_id": c.get("id"),
                            "symbol": c.get("symbol", "").upper() + "USDT",
                            "name": c.get("name"),
                            "image": c.get("large"),
                            "market_cap_rank": c.get("market_cap_rank"),
                            "score": c.get("score", 0),  # 0 = en trend
                        })
                    self._store(key, result)
                    return result
                logger.warning(f"CoinGecko trending: HTTP {resp.status}")
        except Exception as e:
            logger.error(f"CoinGecko trending hatası: {e}")

        return self._cached(key, 9999) or []

    # ──────────────────────────────────────────
    # 3. KATEGORİLER
    # ──────────────────────────────────────────

    async def fetch_categories(self) -> List[dict]:
        """
        CoinGecko /coins/categories
        Market cap'e göre sıralı kategoriler (DeFi, AI, Meme vb.)
        Cache: 10 dakika
        """
        key = "categories"
        cached = self._cached(key, TTL_CATEGORIES)
        if cached is not None:
            return cached

        url = f"{COINGECKO_BASE}/coins/categories"
        try:
            session = await self._get_session()
            async with session.get(url) as resp:
                if resp.status == 200:
                    raw = await resp.json()
                    # Sadece top 20 kategori, en önemli alanlar
                    result = [
                        {
                            "id": c["id"],
                            "name": c["name"],
                            "market_cap": c.get("market_cap") or 0,
                            "market_cap_change_24h": round(c.get("market_cap_change_24h") or 0, 2),
                            "top_3_coins": c.get("top_3_coins_image", []),
                        }
                        for c in raw[:20]
                    ]
                    self._store(key, result)
                    return result
        except Exception as e:
            logger.error(f"CoinGecko categories hatası: {e}")

        return self._cached(key, 9999) or []

    # ──────────────────────────────────────────
    # 4. SEMBOL → LOGO HARİTASI (Hızlı erişim)
    # ──────────────────────────────────────────

    async def get_logo_map(self) -> Dict[str, str]:
        """
        {BTCUSDT: 'https://...bitcoin.png', ETHUSDT: '...'} şeklinde harita döner.
        Token Tarayıcı ve diğer tablolar bu haritayı kullanır.
        """
        key = "logo_map"
        cached = self._cached(key, TTL_MARKETS)
        if cached is not None:
            return cached

        market_data = await self.fetch_market_data()
        logo_map = {c["symbol"]: c["image"] for c in market_data if c.get("image")}
        self._store(key, logo_map)
        return logo_map

    async def get_market_cap_map(self) -> Dict[str, dict]:
        """
        {BTCUSDT: {market_cap: 1.2T, rank: 1, ...}} şeklinde harita.
        Binance TA verisiyle birleştirilir.
        """
        key = "mcap_map"
        cached = self._cached(key, TTL_MARKETS)
        if cached is not None:
            return cached

        market_data = await self.fetch_market_data()
        mcap_map = {
            c["symbol"]: {
                "market_cap": c["market_cap"],
                "market_cap_rank": c["market_cap_rank"],
                "circulating_supply": c["circulating_supply"],
                "ath_change_pct": c["ath_change_pct"],
            }
            for c in market_data
        }
        self._store(key, mcap_map)
        return mcap_map


# Singleton — uygulama boyunca tek örnek
coingecko_service = CoinGeckoService()
