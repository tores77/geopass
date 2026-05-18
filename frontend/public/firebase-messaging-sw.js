/* Firebase Cloud Messaging service worker.
 *
 * Runs in its own browser context (separate from the React app) so it
 * receives push payloads even when the tab is closed. Firebase config
 * is hardcoded here on purpose — service workers cannot read process.env
 * and every value below is public by design.
 *
 * Served from /firebase-messaging-sw.js at the site root.
 */
/* global importScripts firebase self clients */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts(
  "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyBBYZsUQFU7YAaCnI416gCwJ0OEFJQxlhc",
  authDomain: "geopass-umanialabs.firebaseapp.com",
  projectId: "geopass-umanialabs",
  storageBucket: "geopass-umanialabs.firebasestorage.app",
  messagingSenderId: "19238241684",
  appId: "1:19238241684:web:ff92fd579efac3fd4e3b81",
  measurementId: "G-R6PS5D82F9",
});

const messaging = firebase.messaging();

// Skip waiting so a freshly-deployed SW takes over the page on the next
// load without requiring users to close every tab.
self.addEventListener("install", (event) => {
  // eslint-disable-next-line no-console
  console.log("[FCM-SW] install");
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  // eslint-disable-next-line no-console
  console.log("[FCM-SW] activate");
  event.waitUntil(self.clients.claim());
});

// Raw push event — useful to confirm Chrome is delivering to OUR SW at
// all (fires before/regardless of onBackgroundMessage).
self.addEventListener("push", (event) => {
  let preview = "<no-data>";
  try {
    preview = event.data ? event.data.text().slice(0, 200) : preview;
  } catch (e) {
    preview = "<unreadable>";
  }
  // eslint-disable-next-line no-console
  console.log("[FCM-SW] raw push event:", preview);
});

// Fires for data-only payloads (when the backend sends `data` instead of
// `notification`). Browser does NOT auto-render anything; we control the
// notification ourselves so behaviour is identical in foreground and
// background.
messaging.onBackgroundMessage((payload) => {
  // eslint-disable-next-line no-console
  console.log("[FCM-SW] onBackgroundMessage payload:", payload);
  const data = payload && payload.data ? payload.data : {};
  const title = data.title || (payload.notification && payload.notification.title) || "GeoPass™";
  const body =
    data.body || (payload.notification && payload.notification.body) || "";
  const options = {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: data.tag || "geopass-notification",
    renotify: true,
    data: { ...data, click_url: data.click_url || "/" },
  };
  self.registration.showNotification(title, options);
});

// Click handler: focus the app or open it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.click_url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.indexOf(self.location.origin) === 0) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
