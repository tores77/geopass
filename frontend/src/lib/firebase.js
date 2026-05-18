/* Firebase Web SDK initialisation + Web Push helper.
 *
 * All values here are PUBLIC by design — Firebase Web config (apiKey,
 * messagingSenderId, etc.) and the VAPID key are part of the protocol's
 * server-identification handshake and travel to every browser anyway. The
 * real secret stays on the backend (FIREBASE_SERVICE_ACCOUNT_JSON).
 */
import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

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
