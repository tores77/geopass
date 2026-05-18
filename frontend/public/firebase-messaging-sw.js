/* Firebase Cloud Messaging service worker.
 *
 * Runs in its own browser context (separate from the React app) so it
 * receives push payloads even when the tab is closed. Firebase config
 * is hardcoded here on purpose — service workers cannot read process.env
 * and every value below is public by design.
 *
 * Served from /firebase-messaging-sw.js at the site root.
 */
/* global importScripts firebase */
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

// Background message handler: render the system notification when no
// foreground tab is visible. Firebase auto-shows the notification when
// the payload is "notification"-shaped; this hook is for "data"-only.
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "GeoPass™";
  const options = {
    body: payload?.notification?.body || "",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: payload?.data || {},
  };
  // eslint-disable-next-line no-restricted-globals
  self.registration.showNotification(title, options);
});
