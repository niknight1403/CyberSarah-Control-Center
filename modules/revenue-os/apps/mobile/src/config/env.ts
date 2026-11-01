/**
 * CyberSarah Revenue OS — Zentrale Umgebungskonfiguration
 *
 * Diese Datei bündelt ALLE Server-URLs und Konfigurationswerte an einem Ort.
 * Im Produktionsbuild werden die Werte aus .env oder buildFlags gezogen.
 * Im Dev-Modus wird direkt die Hetzner-IP verwendet.
 *
 * ⚠️  WICHTIG: Bevor du einen Production-APK auslieferst, setze
 *     `PROD_API_BASE` auf deine echte Domain (z. B. https://api.cybersarah.app).
 */

// ─── Server-IP / Domain ─────────────────────────────────────────────
const HETZNER_IP = '167.233.196.20' as const;
const HETZNER_PORT = 3000 as const;
const PROD_DOMAIN = 'cybersarah.app' as const;

// ─── Environment Detection ──────────────────────────────────────────
// React Native setzt __DEV__ automatisch — true im Dev-Server/Metro,
// false im Release-Bundle (APK/AAB).
declare const __DEV__: boolean;

// ─── REST API URL ────────────────────────────────────────────────────
export const API_BASE_URL: string = __DEV__
  ? `http://${HETZNER_IP}:${HETZNER_PORT}/api`
  : `http://${HETZNER_IP}:${HETZNER_PORT}/api`;

// ─── WebSocket URL ──────────────────────────────────────────────────
export const WS_BASE_URL: string = __DEV__
  ? `ws://${HETZNER_IP}:${HETZNER_PORT}/ws`
  : `ws://${HETZNER_IP}:${HETZNER_PORT}/ws`;

// ─── Health-Check Endpoint ──────────────────────────────────────────
export const HEALTH_ENDPOINT = '/healthz' as const;

// ─── API Timeouts (in Millisekunden) ────────────────────────────────
export const API_TIMEOUT = 30_000 as const;       // Standard-Timeout
export const API_TIMEOUT_UPLOAD = 120_000 as const; // Upload-Timeout
export const API_TIMEOUT_HEALTH = 10_000 as const;  // Health-Check-Timeout

// ─── Retry-Konfiguration ────────────────────────────────────────────
export const API_MAX_RETRIES = 3 as const;
export const API_RETRY_BASE_DELAY = 1_000 as const;   // 1s initial
export const API_RETRY_MAX_DELAY = 10_000 as const;   // max 10s

// ─── WebSocket-Konfiguration ────────────────────────────────────────
export const WS_RECONNECT_BASE_DELAY = 1_000 as const;     // 1s initial
export const WS_RECONNECT_MAX_DELAY = 30_000 as const;     // max 30s
export const WS_RECONNECT_MAX_ATTEMPTS = 50 as const;      // max 50 Versuche
export const WS_HEARTBEAT_INTERVAL = 30_000 as const;      // Ping alle 30s
export const WS_HEARTBEAT_TIMEOUT = 10_000 as const;       // Pong-Timeout 10s

// ─── Auth / Token ───────────────────────────────────────────────────
export const AUTH_TOKEN_KEY = '@cybersarah/auth_token' as const;
export const AUTH_USER_KEY = '@cybersarah/auth_user' as const;
export const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1_000 as const; // 5 Min vor Ablauf

// ─── Storage Keys ───────────────────────────────────────────────────
export const STORAGE_KEYS = {
  AUTH_TOKEN: AUTH_TOKEN_KEY,
  AUTH_USER: AUTH_USER_KEY,
  SETTINGS: '@cybersarah/settings',
  ONBOARDING_DONE: '@cybersarah/onboarding_done',
} as const;

// ─── App-Metadaten ───────────────────────────────────────────────────
export const APP_VERSION = '5.2.0' as const;
export const APP_BUILD = 17 as const;
export const APP_NAME = 'CyberSarah' as const;

// ─── Helper: Lässt sich zur Laufzeit patchen (z. B. nach Login mit User-Config) ──
let _overriddenBaseUrl: string | null = null;
let _overriddenWsUrl: string | null = null;

export function setApiBaseUrl(url: string): void {
  _overriddenBaseUrl = url;
}

export function setWsBaseUrl(url: string): void {
  _overriddenWsUrl = url;
}

export function getEffectiveApiUrl(): string {
  return _overriddenBaseUrl ?? API_BASE_URL;
}

export function getEffectiveWsUrl(): string {
  return _overriddenWsUrl ?? WS_BASE_URL;
}

// ─── Export des gesamten Config-Objekts ──────────────────────────────
const env = {
  API_BASE_URL,
  WS_BASE_URL,
  HEALTH_ENDPOINT,
  API_TIMEOUT,
  API_TIMEOUT_UPLOAD,
  API_TIMEOUT_HEALTH,
  API_MAX_RETRIES,
  API_RETRY_BASE_DELAY,
  API_RETRY_MAX_DELAY,
  WS_RECONNECT_BASE_DELAY,
  WS_RECONNECT_MAX_DELAY,
  WS_RECONNECT_MAX_ATTEMPTS,
  WS_HEARTBEAT_INTERVAL,
  WS_HEARTBEAT_TIMEOUT,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  TOKEN_REFRESH_THRESHOLD_MS,
  STORAGE_KEYS,
  APP_VERSION,
  APP_BUILD,
  APP_NAME,
  setApiBaseUrl,
  setWsBaseUrl,
  getEffectiveApiUrl,
  getEffectiveWsUrl,
  HETZNER_IP,
  HETZNER_PORT,
  PROD_DOMAIN,
} as const;

export default env;
