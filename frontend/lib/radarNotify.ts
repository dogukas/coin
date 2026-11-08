"use client";

// Tarayıcı / sistem bildirimleri. Service worker sayesinde sekme arka plandayken ve
// (Android Chrome gibi) `new Notification` desteklemeyen mobil tarayıcılarda da çalışır.

export type NotifyPermission = "unsupported" | "denied" | "default" | "granted";

export function getNotifyPermission(): NotifyPermission {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  return Notification.permission as NotifyPermission;
}

/** Kullanıcı etkileşimiyle çağrılmalı (buton tıklaması). */
export async function enableNotifications(): Promise<NotifyPermission> {
  if (typeof window === "undefined" || typeof Notification === "undefined") return "unsupported";
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch {
      // SW kaydı başarısızsa doğrudan Notification API'ye düşeriz
    }
  }
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  return getNotifyPermission();
}

export async function showSystemNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (getNotifyPermission() !== "granted") return false;
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, { body, tag, icon: "/favicon.ico" });
        return true;
      }
    }
    new Notification(title, { body, tag, icon: "/favicon.ico" });
    return true;
  } catch {
    return false;
  }
}

