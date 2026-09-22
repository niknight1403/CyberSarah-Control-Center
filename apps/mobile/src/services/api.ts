/**
 * CyberSarah Revenue OS — Produktionsreifer API-Client
 *
 * Features:
 *  - Zentrale Konfiguration über @config/env
 *  - JWT-Token automatisch aus SecureStore/AsyncStorage
 *  - Silent-Refresh bei 401 (Token-Rotation)
 *  - Exponentielles Backoff-Retry bei Netzwerkfehlern
 *  - Globaler Error-Handler (401 → Logout, 403 → Alert, 5xx → Retry)
 *  - Upload-Support mit Fortschritt
 *  - Vollständig typsicher
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getEffectiveApiUrl,
  API_TIMEOUT,
  API_TIMEOUT_UPLOAD,
  API_MAX_RETRIES,
  API_RETRY_BASE_DELAY,
  API_RETRY_MAX_DELAY,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  TOKEN_REFRESH_THRESHOLD_MS,
} from '../config/env';

// ══════════════════════════════════════════════════════════════════════
// TYPEN
// ══════════════════════════════════════════════════════════════════════

export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
  success: boolean;
  timestamp: number;
}

export interface ApiError {
  message: string;
  code: string;
  status: number;
  details?: Record<string, string[]>;
  isNetworkError: boolean;
  isAuthError: boolean;
}

// Callback, den AuthContext registriert, um bei 401 global auszuloggen
let onGlobalUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void): void {
  onGlobalUnauthorized = handler;
}

// ══════════════════════════════════════════════════════════════════════
// TOKEN-MANAGEMENT
// ══════════════════════════════════════════════════════════════════════

let authToken: string | null = null;
let tokenRefreshPromise: Promise<string | null> | null = null;

async function getTokenFromStorage(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function storeToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // Storage-Fehler ignorieren, Token bleibt nur im RAM
  }
}

async function clearStorageToken(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, AUTH_USER_KEY]);
  } catch {
    // ignorieren
  }
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? ''));
    const expiry = (payload.exp ?? 0) * 1000;
    return Date.now() >= expiry - TOKEN_REFRESH_THRESHOLD_MS;
  } catch {
    return true;
  }
}

// ══════════════════════════════════════════════════════════════════════
// AXIOS-INSTANZ
// ══════════════════════════════════════════════════════════════════════

const axiosInstance: AxiosInstance = axios.create({
  baseURL: getEffectiveApiUrl(),
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Client-Version': '5.2.0',
    'X-Client-Platform': 'react-native',
  },
});

// ══════════════════════════════════════════════════════════════════════
// REQUEST-INTERCEPTOR: Token anhängen + URL aktualisieren
// ══════════════════════════════════════════════════════════════════════

axiosInstance.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Basis-URL dynamisch halten
    config.baseURL = getEffectiveApiUrl();

    // Token besorgen (RAM → Storage)
    const token = authToken ?? (await getTokenFromStorage());
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ══════════════════════════════════════════════════════════════════════
// RESPONSE-INTERCEPTOR: 401-Refresh + Retry + Error-Normalisierung
// ══════════════════════════════════════════════════════════════════════

interface QueueItem {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

let isRefreshing = false;
let failedQueue: QueueItem[] = [];

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    } else {
      prom.reject(new Error('Token-Refresh fehlgeschlagen'));
    }
  });
  failedQueue = [];
}

// Retry-Delay mit exponentiellem Backoff + Jitter
function getRetryDelay(attempt: number): number {
  const exponential = Math.min(
    API_RETRY_BASE_DELAY * Math.pow(2, attempt),
    API_RETRY_MAX_DELAY,
  );
  // Jitter: ±25%
  const jitter = exponential * (0.75 + Math.random() * 0.5);
  return Math.round(jitter);
}

// Token-Refresh beim Server
async function refreshTokenOnServer(): Promise<string | null> {
  try {
    const currentToken = authToken ?? (await getTokenFromStorage());
    if (!currentToken) return null;

    const resp = await axios.post<ApiResponse<{ token: string }>>(
      `${getEffectiveApiUrl()}/auth/refresh`,
      {},
      { headers: { Authorization: `Bearer ${currentToken}` } },
    );
    const newToken = resp.data.data.token;
    authToken = newToken;
    await storeToken(newToken);
    return newToken;
  } catch {
    authToken = null;
    await clearStorageToken();
    return null;
  }
}

// Globaler 401-Handler
async function handleUnauthorized(): Promise<void> {
  try {
    // Versuche Logout-Request (fehlertolerant)
    const token = authToken ?? (await getTokenFromStorage());
    if (token) {
      await axios.post(
        `${getEffectiveApiUrl()}/auth/logout`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
    }
  } catch {
    // ignorieren
  }
  authToken = null;
  await clearStorageToken();
  onGlobalUnauthorized?.();
}

axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      _retryCount?: number;
    };

    // ─── 401 Unauthorized → Silent Token-Refresh ────────────────
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Warte auf laufenden Refresh
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return axiosInstance(originalRequest);
        }).catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        tokenRefreshPromise = refreshTokenOnServer();
        const newToken = await tokenRefreshPromise;
        tokenRefreshPromise = null;

        if (newToken) {
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return axiosInstance(originalRequest);
        }

        // Refresh fehlgeschlagen → ausloggen
        processQueue(new Error('Refresh failed'), null);
        await handleUnauthorized();
        return Promise.reject(error);
      } catch (refreshError) {
        processQueue(refreshError, null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // ─── 403 Forbidden → Direkt ausloggen ────────────────────
    if (error.response?.status === 403) {
      await handleUnauthorized();
      return Promise.reject(error);
    }

    // ─── Netzwerkfehler → Retry mit Backoff ─────────────────
    if (
      !error.response &&
      (originalRequest._retryCount ?? 0) < API_MAX_RETRIES
    ) {
      const attempt = originalRequest._retryCount ?? 0;
      originalRequest._retryCount = attempt + 1;
      const delay = getRetryDelay(attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return axiosInstance(originalRequest);
    }

    // ─── 5xx Server-Fehler → Auch retry (idempotente Requests) ─
    if (
      error.response?.status >= 500 &&
      error.response?.status < 600 &&
      (originalRequest._retryCount ?? 0) < API_MAX_RETRIES &&
      originalRequest.method !== 'post' // POST nicht automatisch retryen
    ) {
      const attempt = originalRequest._retryCount ?? 0;
      originalRequest._retryCount = attempt + 1;
      const delay = getRetryDelay(attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return axiosInstance(originalRequest);
    }

    // ─── Fehler normalisieren ───────────────────────────────
    const apiError: ApiError = {
      message:
        error.response?.data?.message ||
        error.message ||
        'Ein Fehler ist aufgetreten',
      code: error.response?.data?.code || error.code || 'UNKNOWN_ERROR',
      status: error.response?.status || 0,
      details: error.response?.data?.details,
      isNetworkError: !error.response,
      isAuthError: error.response?.status === 401 || error.response?.status === 403,
    };

    return Promise.reject(apiError);
  },
);

// ══════════════════════════════════════════════════════════════════════
// API-CLIENT KLASSE
// ══════════════════════════════════════════════════════════════════════

class ApiClient {
  private instance: AxiosInstance;

  constructor(instance: AxiosInstance) {
    this.instance = instance;
  }

  /** Token nach erfolgreichem Login setzen. */
  setAuthToken(token: string): void {
    authToken = token;
  }

  /** Bei Logout Token entfernen. */
  clearAuthToken(): void {
    authToken = null;
  }

  /** Prüft ob ein gültiger Token im RAM/Storage liegt. */
  async hasValidToken(): Promise<boolean> {
    const token = authToken ?? (await getTokenFromStorage());
    if (!token) return false;
    return !isTokenExpired(token);
  }

  // ─── CRUD-Methoden ──────────────────────────────────────────

  async get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.instance.get<ApiResponse<T>>(url, config);
    return response.data.data;
  }

  async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.instance.post<ApiResponse<T>>(url, data, config);
    return response.data.data;
  }

  async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.instance.put<ApiResponse<T>>(url, data, config);
    return response.data.data;
  }

  async patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.instance.patch<ApiResponse<T>>(url, data, config);
    return response.data.data;
  }

  async delete<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.instance.delete<ApiResponse<T>>(url, config);
    return response.data.data;
  }

  /** Datei-Upload mit Fortschrittsanzeige. */
  async upload<T = unknown>(
    url: string,
    formData: FormData,
    onProgress?: (progress: number) => void,
  ): Promise<T> {
    const response = await this.instance.post<ApiResponse<T>>(url, formData, {
      timeout: API_TIMEOUT_UPLOAD,
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          onProgress(
            Math.round((progressEvent.loaded * 100) / progressEvent.total),
          );
        }
      },
    });
    return response.data.data;
  }

  /** Roh-Response (z. B. für Blob-Download). */
  async getRaw(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse> {
    return this.instance.get(url, {
      ...config,
      responseType: 'blob',
    });
  }
}

export const apiClient = new ApiClient(axiosInstance);
export default apiClient;
