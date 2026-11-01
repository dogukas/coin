import aiohttp
import asyncio
import logging
import time
from typing import Dict, Any, Optional, List
from app.core.config import settings

logger = logging.getLogger(__name__)

class ExternalDataService:
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self.cache: Dict[str, dict] = {}
    
    async def _get_session(self) -> aiohttp.ClientSession:
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=10)
            )
        return self.session

    def _get_cached(self, key: str, ttl: int) -> Optional[Any]:
        if key in self.cache:
            entry = self.cache[key]
            if time.time() - entry["ts"] < ttl:
                return entry["data"]
        return None

    def _set_cached(self, key: str, data: Any):
        self.cache[key] = {"data": data, "ts": time.time()}

    async def fetch_coingecko_data(self) -> List[dict]:
        """
        Fetch top 250 coins by market cap from CoinGecko (Free API).
        Cached for 5 minutes (300s) to prevent strict rate limiting.
        """
        cache_key = "coingecko_top_250"
        cached = self._get_cached(cache_key, 300)
        if cached is not None:
            return cached

        url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
        try:
            session = await self._get_session()
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    self._set_cached(cache_key, data)
                    return data
                logger.warning(f"CoinGecko API returned status {response.status}")
        except Exception as e:
            logger.error(f"Error fetching CoinGecko data: {e}")
        return []

    async def fetch_defillama_tvl(self) -> List[dict]:
        """
        Fetch TVL data from DefiLlama (Free API).
        Cached for 15 minutes (900s).
        """
        cache_key = "defillama_tvl"
        cached = self._get_cached(cache_key, 900)
        if cached is not None:
            return cached

        url = "https://api.llama.fi/protocols"
        try:
            session = await self._get_session()
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    self._set_cached(cache_key, data)
                    return data
                logger.warning(f"DefiLlama API returned status {response.status}")
        except Exception as e:
            logger.error(f"Error fetching DefiLlama data: {e}")
        return []

    async def fetch_coinglass_oi(self, symbol: str) -> dict:
        """
        Fetch Open Interest data from Coinglass.
        Cached for 60s.
        """
        if not settings.COINGLASS_API_KEY:
            return {"error": "No API Key", "open_interest": None}
            
        cache_key = f"coinglass_oi_{symbol}"
        cached = self._get_cached(cache_key, 60)
        if cached is not None:
            return cached

        url = f"https://open-api.coinglass.com/public/v2/indicator/open_interest?symbol={symbol}"
        headers = {
            "coinglassSecret": settings.COINGLASS_API_KEY,
            "accept": "application/json"
        }
        try:
            session = await self._get_session()
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    self._set_cached(cache_key, data)
                    return data
        except Exception as e:
            logger.error(f"Error fetching Coinglass data: {e}")
        return {}

    async def fetch_cryptopanic_news(self, filter: str = "hot") -> dict:
        """
        Fetch news from CryptoPanic.
        Cached for 5 minutes (300s).
        """
        if not settings.CRYPTOPANIC_API_KEY:
            return {"results": [{"title": "API Key Required for CryptoPanic", "url": "#"}]}
            
        cache_key = f"cryptopanic_{filter}"
        cached = self._get_cached(cache_key, 300)
        if cached is not None:
            return cached

        url = f"https://cryptopanic.com/api/v1/posts/?auth_token={settings.CRYPTOPANIC_API_KEY}&filter={filter}"
        try:
            session = await self._get_session()
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    self._set_cached(cache_key, data)
                    return data
        except Exception as e:
            logger.error(f"Error fetching CryptoPanic news: {e}")
        return {}

external_data_service = ExternalDataService()
