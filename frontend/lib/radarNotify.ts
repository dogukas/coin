"use client";

// Masaüstü + Mobil (Android Chrome & iOS Safari 16.4+ PWA) bildirim ve ekran kilidi (Wake Lock) yöneticisi.
// iOS kuralı: Bildirim izni için site "Ana Ekrana Ekle" ile kurulmalı ve requestPermission ilk senkron adımda çağrılmalı.
// Android kuralı: `new Notification()` yasaktır; bildirimler aktif ServiceWorkerRegistration üzerinden gösterilmelidir.

export type NotifyPermission = "unsupported" | "ios-install-needed" | "denied" | "default" | "granted";

export interface MobilePlatformInfo {
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  needsIOSInstall: boolean;
  wakeLockSupported: boolean;
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

export function detectMobilePlatform(): MobilePlatformInfo {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      isMobile: false,
      isIOS: false,
      isAndroid: false,
      isStandalone: false,
      needsIOSInstall: false,
      wakeLockSupported: false,
    };
  }
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid || /Mobile/i.test(ua);
  const nav = navigator as NavigatorWithStandalone;
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    nav.standalone === true;
  const needsIOSInstall = isIOS && !isStandalone && typeof Notification === "undefined";
  const wakeLockSupported = "wakeLock" in navigator;

  return {
    isMobile,
    isIOS,
    isAndroid,
    isStandalone,
    needsIOSInstall,
    wakeLockSupported,
  };
}

export function getNotifyPermission(): NotifyPermission {
  if (typeof window === "undefined") return "unsupported";
  const platform = detectMobilePlatform();
  if (platform.needsIOSInstall) return "ios-install-needed";
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission as NotifyPermission;
}

/** Sayfa açılışında Service Worker'ı önceden hazırlar (Android ve iOS için kritik). */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/sw.js");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

/**
 * Kullanıcı buton tıklamasıyla çağrılmalı.
 * ÖNEMLİ: iOS Safari'de kullanıcı etkileşimi (user gesture) kaybolmaması için
 * Notification.requestPermission() ilk satırda çağrılır!
 */
export async function enableNotifications(): Promise<NotifyPermission> {
  if (typeof window === "undefined") return "unsupported";
  const platform = detectMobilePlatform();
  if (platform.needsIOSInstall) return "ios-install-needed";
  if (typeof Notification === "undefined") return "unsupported";

  try {
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  } catch {
    // Bazı eski tarayıcılarda callback tabanlı olabilir
    try {
      Notification.requestPermission(() => {});
    } catch {
      // yoksay
    }
  }

  await ensureServiceWorker();
  return getNotifyPermission();
}

export async function showSystemNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (getNotifyPermission() !== "granted") return false;

  // Mobil cihazlarda titreşim
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {
    // titreşim desteklenmiyorsa yoksay
  }

  // 1) Önce Service Worker üzerinden dene (Android Chrome & iOS PWA için zorunlu)
  try {
    if ("serviceWorker" in navigator) {
      const reg = (await ensureServiceWorker()) ?? (await navigator.serviceWorker.ready);
      if (reg && "showNotification" in reg) {
        const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
          body,
          tag,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          vibrate: [200, 100, 200, 100, 300],
          renotify: true,
          data: { url: "/radar" },
        };
        await reg.showNotification(title, options);
        return true;
      }
    }
  } catch {
    // Service worker başarısız olursa masaüstü Notification API'ye düş
  }

  // 2) Masaüstü yedek: doğrudan Notification constructor
  try {
    new Notification(title, { body, tag, icon: "/icon-192.png" });
    return true;
  } catch {
    return false;
  }
}

// ── Mobil Ekran Açık Tutma (Screen Wake Lock API) ─────────────────────────────
export async function requestScreenWakeLock(): Promise<WakeLockSentinel | null> {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return null;
  try {
    return await navigator.wakeLock.request("screen");
  } catch {
    return null;
  }
}
