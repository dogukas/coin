# 🚀 gstack Software Factory Protocols — Crypto Trading Station

Bu proje **Garry Tan (gstack)** "Software Factory" metodolojisiyle yönetilmektedir.
Her geliştirme adımı aşağıdaki 5 uzman rolünün sıkı standartlarından geçer:

---

## 1. 👔 CEO & Office Hours Standardı (/plan-ceo-review)
- **Tek Hedef:** Kullanıcının en saf, en net veriye ulaşarak kârlı yatırım kararları alması.
- **Sıfır Çöp Kuralı:** Hiçbir görsel veya veri akışı birbirine karışamaz. Her kaynak (Binance, CoinGecko, MEXC) kendi izole kanalından gelir.
- **Kullanılmayan Kod Yok:** Gereksiz karmaşıklık, şişirilmiş bağımlılıklar reddedilir.

---

## 2. 🛡️ CSO Güvenlik Standardı (/cso)
- **API Güvenliği:** Tüm harici borsa çağrıları (MEXC, CoinGecko) Next.js route handler veya backend proxy üzerinden geçer; istemci tarafında key veya raw endpoint açığı bırakılmaz.
- **Rate Limit Koruması:** CoinGecko (30 req/min) ve borsa limitleri için memory cache (TTL) zorunludur.
- **WebSocket Hijyen:** Bağlantı koptuğunda zombie socket kalmamalı; exponential backoff ile otomatik yeniden bağlanmalı.

---

## 3. 🔍 Kıdemli Kod İnceleme Standardı (/review)
- **TypeScript Katılığı:** `any` tipi yasaktır; tüm borsa payload'ları typed interface ile karşılanır.
- **Temizlik & Bellek:** Her `useEffect` mutlaka `clearInterval` ve `ws.close()` cleanup döndürmelidir.
- **Hata Yönetimi:** Dış servis çökse dahi arayüz kırılmaz; cache veya graceful fallback gösterilir.

---

## 4. 🎨 Tasarım Denetimi Standardı (/design-review)
- **AI Slop Yasak:** Jenerik renkler, standart gridler yasaktır. Özel dark-mode (#08090b, #0d0e12), curated neon vurgular (emerald-400, rose-400, violet-400), monospace finansal rakamlar kullanılır.
- **Canlı Geri Bildirim:** Fiyat değişimlerinde flash efektleri, alıcı/satıcı oran barı, mini sparkline grafikleri standarttır.

---

## 5. 🧪 QA Canlı Tarayıcı Standardı (/qa)
- Kod değişikliği sonrası tarayıcı üzerinde canlı test zorunludur:
  - Header navigasyonu çalışıyor mu?
  - Canlı fiyatlar ve emir defteri akıyor mu?
  - Console'da unhandled exception veya hydration hatası var mı?
