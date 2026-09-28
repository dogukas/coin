import random
import time
from typing import List, Dict
from datetime import datetime

class WhaleService:
    """
    Service for tracking massive Whale transactions (On-Chain & Exchange).
    Currently generates realistic synthetic data using real market symbols
    until a paid API key (like Whale Alert) is integrated.
    """
    
    def __init__(self):
        self.exchanges = ["Binance", "Coinbase", "Kraken", "OKX", "Bybit", "Unknown Wallet"]
        self.coins = ["BTC", "ETH", "SOL", "USDT", "USDC", "XRP", "DOGE"]
        
    def generate_recent_whales(self, limit: int = 20) -> List[Dict]:
        whales = []
        now = int(time.time())
        
        for i in range(limit):
            coin = random.choice(self.coins)
            
            # Determine transaction size based on coin
            if coin in ["USDT", "USDC"]:
                amount = random.uniform(10_000_000, 150_000_000)
                amount_usd = amount
            elif coin == "BTC":
                amount = random.uniform(500, 3000)
                amount_usd = amount * 65000  # Approx
            elif coin == "ETH":
                amount = random.uniform(5000, 25000)
                amount_usd = amount * 3500
            elif coin == "SOL":
                amount = random.uniform(50000, 300000)
                amount_usd = amount * 150
            else:
                amount = random.uniform(5000000, 20000000)
                amount_usd = amount * 0.5

            # Transaction flow
            sender = random.choice(self.exchanges)
            receiver = random.choice(self.exchanges)
            
            # Ensure they are different
            while receiver == sender:
                receiver = random.choice(self.exchanges)
                
            # Classify impact
            if sender == "Unknown Wallet" and receiver != "Unknown Wallet":
                # Moving to exchange -> Potential dump
                action_type = "inflow"
                alert_level = "danger" if amount_usd > 50_000_000 else "warning"
            elif sender != "Unknown Wallet" and receiver == "Unknown Wallet":
                # Moving to cold wallet -> Holding / Supply shock
                action_type = "outflow"
                alert_level = "success"
            else:
                # Exchange to Exchange -> Neutral
                action_type = "transfer"
                alert_level = "neutral"
                
            # Random time in the last 60 minutes
            tx_time = now - random.randint(30, 3600)
            
            whales.append({
                "id": f"tx_{tx_time}_{i}",
                "coin": coin,
                "amount": round(amount, 2),
                "amount_usd": round(amount_usd, 2),
                "sender": sender,
                "receiver": receiver,
                "type": action_type,
                "alert_level": alert_level,
                "timestamp": tx_time,
                "hash": f"0x{random.getrandbits(128):032x}"
            })
            
        # Sort by timestamp descending
        whales.sort(key=lambda x: x["timestamp"], reverse=True)
        return whales

whale_service = WhaleService()
