import aiohttp
import asyncio
import logging
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

    async def fetch_coingecko_data(self) -> List[dict]:
        """
        Fetch top 250 coins by market cap from CoinGecko (Free API).
        Returns a list of coin data (market cap, fdv, category if possible).
        Note: CoinGecko rate limits are strict (~10-30 req/min). Cache this aggressively.
        """
        url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1"
        try:
            session = await self._get_session()
            async with session.get(url) as response:
                if response.status == 200:
                    return await response.json()
                logger.warning(f"CoinGecko API returned status {response.status}")
        except Exception as e:
            logger.error(f"Error fetching CoinGecko data: {e}")
        return []

    async def fetch_defillama_tvl(self) -> List[dict]:
        """
        Fetch TVL data from DefiLlama (Free API).
        """
        url = "https://api.llama.fi/protocols"
        try:
            session = await self._get_session()
            async with session.get(url) as response:
                if response.status == 200:
                    return await response.json()
                logger.warning(f"DefiLlama API returned status {response.status}")
        except Exception as e:
            logger.error(f"Error fetching DefiLlama data: {e}")
        return []

    async def fetch_coinglass_oi(self, symbol: str) -> dict:
        """
        Fetch Open Interest data from Coinglass.
        Requires API key in headers.
        """
        if not settings.COINGLASS_API_KEY:
            # Return mocked/fallback if no key
            return {"error": "No API Key", "open_interest": None}
            
        url = f"https://open-api.coinglass.com/public/v2/indicator/open_interest?symbol={symbol}"
        headers = {
            "coinglassSecret": settings.COINGLASS_API_KEY,
            "accept": "application/json"
        }
        try:
            session = await self._get_session()
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    return await response.json()
        except Exception as e:
            logger.error(f"Error fetching Coinglass data: {e}")
        return {}

    async def fetch_cryptopanic_news(self, filter: str = "hot") -> dict:
        """
        Fetch news from CryptoPanic.
        Requires Auth Token.
        """
        if not settings.CRYPTOPANIC_API_KEY:
            # Return mocked/fallback if no key
            return {"results": [{"title": "API Key Required for CryptoPanic", "url": "#"}]}
            
        url = f"https://cryptopanic.com/api/v1/posts/?auth_token={settings.CRYPTOPANIC_API_KEY}&filter={filter}"
        try:
            session = await self._get_session()
            async with session.get(url) as response:
                if response.status == 200:
                    return await response.json()
        except Exception as e:
            logger.error(f"Error fetching CryptoPanic news: {e}")
        return {}

external_data_service = ExternalDataService()
