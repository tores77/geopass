/* Firebase Web SDK initialisation + Web Push helper.
 *
 * All values here are PUBLIC by design — Firebase Web config (apiKey,
 * messagingSenderId, etc.) and the VAPID key are part of the protocol's
 * server-identification handshake and travel to every browser anyway. The
 * real secret stays on the backend (FIREBASE_SERVICE_ACCOUNT_JSON).
 */
import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY;

let _app = null;
let _messaging = null;

function ensureApp() {
  if (!_app) {
    _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return _app;
}

async function ensureMessaging() {
  if (_messaging) return _messaging;
  if (!(await isSupported())) return null;
  ensureApp();
  _messaging = getMessaging();
  return _messaging;
}

/**
 * Listen for FCM messages that arrive while the tab is in the FOREGROUND.
 *
 * The service worker only handles background pushes — when the page is
 * visible, FCM delivers the payload here instead and the browser does NOT
 * auto-render any notification. We bridge it to the Web Notification API
 * so users see the message either way.
 *
 * Idempotent: calling more than once is a no-op after the first
 * successful subscription. Safe to invoke on every page load.
 *
 * @param {(payload: any) => void} [onAlso] optional callback (e.g. to update UI)
 */
let _foregroundUnsubscribe = null;
export async function listenForegroundMessages(onAlso) {
  if (_foregroundUnsubscribe) return; // already listening
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  const messaging = await ensureMessaging();
  if (!messaging) return;
  _foregroundUnsubscribe = onMessage(messaging, (payload) => {
    // eslint-disable-next-line no-console
    console.log("[FCM] foreground message:", payload);
    const data = (payload && payload.data) || {};
    const title =
      data.title || (payload.notification && payload.notification.title) || "GeoPass™";
    const body =
      data.body || (payload.notification && payload.notification.body) || "";
    try {
      navigator.serviceWorker
        ?.getRegistration("/firebase-messaging-sw.js")
        .then((reg) => {
          if (reg) {
            reg.showNotification(title, {
              body,
              icon: "/favicon.ico",
              badge: "/favicon.ico",
              tag: data.tag || "geopass-notification",
              renotify: true,
              data: { ...data, click_url: data.click_url || "/" },
            });
          } else {
            // Fallback: use the Notification constructor directly.
            new Notification(title, { body, icon: "/favicon.ico" });
          }
        });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[FCM] showNotification error:", e);
    }
    if (typeof onAlso === "function") onAlso(payload);
  });
  // eslint-disable-next-line no-console
  console.log("[FCM] foreground listener attached");
}

/**
 * Request notification permission and return an FCM Web Push token.
 *
 * @returns {Promise<{token: string|null, status: "granted"|"denied"|"default"|"unsupported"|"error", error?: string}>}
 */
export async function getPushToken() {
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
    return { token: null, status: "unsupported" };
  }
  try {
    const messaging = await ensureMessaging();
    if (!messaging) return { token: null, status: "unsupported" };

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { token: null, status: permission };
    }

    // Register the FCM service worker explicitly so it works under our
    // PWA scope regardless of CRA's default sw registration timing.
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: reg,
    });
    return { token: token || null, status: token ? "granted" : "error" };
  } catch (e) {
    return { token: null, status: "error", error: String(e?.message || e) };
  }
}
