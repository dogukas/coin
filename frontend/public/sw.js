// Pump Radar bildirim Service Worker'ı (Masaüstü + Android Chrome + iOS PWA).
// Hem postMessage ile hem de doğrudan registration.showNotification ile bildirim tetiklenmesini destekler.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "RADAR_NOTIFY") return;
  const { title, body, tag, url } = data;
  event.waitUntil(
    self.registration.showNotification(title || "Pump Radar", {
      body: body || "",
      tag: tag || "radar-event",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [200, 100, 200, 100, 300],
      renotify: true,
      data: { url: url || "/radar" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/radar";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client && !client.url.includes("/radar")) {
            return client.navigate(targetUrl);
          }
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
