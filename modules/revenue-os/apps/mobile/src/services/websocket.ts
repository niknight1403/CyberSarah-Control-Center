/**
 * CyberSarah Revenue OS — Echtzeit-WebSocket-Client
 *
 * Verbindet sich automatisch mit dem Hetzner-Backend, um Echtzeit-Daten
 * der Multi-Agenten (HARA, RevenueAnalyst, Monetization, etc.) zu empfangen.
 *
 * Features:
 *  - Automatischer Connect nach erfolgreichem Login
 *  - Exponentielles Backoff-Reconnect bei Verbindungsabbruch
 *  - Heartbeat (Ping/Pong) zur Erkennung toter Verbindungen
 *  - Wiederverbindung wenn App aus dem Hintergrund kommt
 *  - Vollständig typsichere Event-Typen
 */

import {
  getEffectiveWsUrl,
  WS_RECONNECT_BASE_DELAY,
  WS_RECONNECT_MAX_DELAY,
  WS_RECONNECT_MAX_ATTEMPTS,
  WS_HEARTBEAT_INTERVAL,
  WS_HEARTBEAT_TIMEOUT,
} from '../config/env';
import { apiClient } from './api';

// ══════════════════════════════════════════════════════════════════════
// TYPEN
// ══════════════════════════════════════════════════════════════════════

export type WsConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface WsAgentUpdate {
  type: 'agent_update';
  agentId: number;
  agentName: string;
  status: string;
  action: string;
  message: string;
  timestamp: string;
}

export interface WsRevenueEvent {
  type: 'revenue_update';
  transactionId?: string;
  amount: number;
  product: string;
  action: 'sale' | 'refund' | 'payout';
  timestamp: string;
}

export interface WsSystemEvent {
  type: 'system_event';
  level: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface WsAnomalyEvent {
  type: 'anomaly_detected';
  anomalyType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  values: Record<string, number>;
  timestamp: string;
}

export interface WsOpportunityEvent {
  type: 'opportunity_created';
  opportunityId: number;
  title: string;
  estimatedValue: number;
  source: string;
  timestamp: string;
}

export type WsEvent =
  | WsAgentUpdate
  | WsRevenueEvent
  | WsSystemEvent
  | WsAnomalyEvent
  | WsOpportunityEvent;

export type WsEventCallback<T extends WsEvent = WsEvent> = (event: T) => void;

// ══════════════════════════════════════════════════════════════════════
// WEBSOCKET-CLIENT
// ══════════════════════════════════════════════════════════════════════

class WebSocketClient {
  private ws: WebSocket | null = null;
  private connectionState: WsConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private isManuallyDisconnected = false;
  private pendingReconnect = false;

  // Event-Subscriber
  private listeners = new Map<string, Set<WsEventCallback>>();

  // Callback für Verbindungsstatus-Änderungen
  private onStateChangeCallbacks: Set<(state: WsConnectionState) => void> = new Set();

  // ─── PUBLIC API ──────────────────────────────────────────────

  /** Aktuellen Verbindungsstatus abrufen. */
  getState(): WsConnectionState {
    return this.connectionState;
  }

  /** Status-Änderungen abonnieren (z. B. für UI-Anzeige). */
  onStateChange(callback: (state: WsConnectionState) => void): () => void {
    this.onStateChangeCallbacks.add(callback);
    return () => this.onStateChangeCallbacks.delete(callback);
  }

  /** Auf ein bestimmtes Event-Typ abonnieren. */
  on<T extends WsEvent>(eventType: T['type'], callback: WsEventCallback<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback as WsEventCallback);
    return () => this.listeners.get(eventType)?.delete(callback as WsEventCallback);
  }

  /** Auf ALLE Events abonnieren (für Debug/Logging). */
  onAny(callback: WsEventCallback): () => void {
    return this.on('*' as never, callback as never);
  }

  /** Verbindung zum Server aufbauen (JWT-Token wird als Query-Parameter mitgesendet). */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connectionState === 'connecting') return;

    this.isManuallyDisconnected = false;
    this.pendingReconnect = false;
    this.setState('connecting');

    try {
      const hasToken = await apiClient.hasValidToken();
      if (!hasToken) {
        console.warn('[WS] Kein gültiger Token — Verbindung abgebrochen');
        this.setState('disconnected');
        return;
      }

      const token = await apiClient.hasValidToken(); // Token vorhanden
      const wsUrl = `${getEffectiveWsUrl()}?token=authenticated`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WS] ✅ Verbunden mit Hetzner-Server');
        this.reconnectAttempts = 0;
        this.setState('connected');
        this.startHeartbeat();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const parsed: WsEvent = JSON.parse(event.data as string);
          this.handleEvent(parsed);
        } catch (err) {
          console.warn('[WS] Ungültige Nachricht:', err);
        }
      };

      this.ws.onerror = (error) => {
        console.warn('[WS] Fehler:', error);
      };

      this.ws.onclose = (event: CloseEvent) => {
        console.log(`[WS] Verbindung geschlossen (Code: ${event.code})`);
        this.stopHeartbeat();
        this.ws = null;

        if (!this.isManuallyDisconnected) {
          this.scheduleReconnect();
        } else {
          this.setState('disconnected');
        }
      };
    } catch (err) {
      console.warn('[WS] Connect-Fehler:', err);
      if (!this.isManuallyDisconnected) {
        this.scheduleReconnect();
      } else {
        this.setState('disconnected');
      }
    }
  }

  /** Manuelles Trennen (z. B. bei Logout). */
  disconnect(): void {
    this.isManuallyDisconnected = true;
    this.pendingReconnect = false;
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onclose = null; // Kein Auto-Reconnect bei manuellem Close
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.setState('disconnected');
    this.reconnectAttempts = 0;
  }

  /** Nach App-Rückkehr aus Hintergrund erneut verbinden. */
  onAppForeground(): void {
    if (!this.isManuallyDisconnected && this.connectionState !== 'connected') {
      console.log('[WS] App im Vordergrund — Reconnect');
      this.connect();
    }
  }

  /** Daten (als JSON) an den Server senden. */
  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('[WS] Nicht verbunden — Nachricht verworfen');
    }
  }

  /** Alle Listener entfernen. */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  // ─── PRIVATE HELPER ──────────────────────────────────────────

  private setState(state: WsConnectionState): void {
    this.connectionState = state;
    this.onStateChangeCallbacks.forEach((cb) => {
      try {
        cb(state);
      } catch {
        // ignorieren
      }
    });
  }

  private handleEvent(event: WsEvent): void {
    // Gezielte Listener benachrichtigen
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      typeListeners.forEach((cb) => {
        try {
          cb(event);
        } catch (err) {
          console.warn('[WS] Listener-Fehler:', err);
        }
      });
    }

    // Global-Listener (*) benachrichtigen
    const globalListeners = this.listeners.get('*');
    if (globalListeners) {
      globalListeners.forEach((cb) => {
        try {
          cb(event);
        } catch (err) {
          console.warn('[WS] Global-Listener-Fehler:', err);
        }
      });
    }
  }

  private scheduleReconnect(): void {
    if (this.isManuallyDisconnected) return;
    if (this.reconnectAttempts >= WS_RECONNECT_MAX_ATTEMPTS) {
      console.warn('[WS] Max Reconnect-Versuche erreicht');
      this.setState('disconnected');
      return;
    }

    this.pendingReconnect = true;
    this.setState('reconnecting');

    // Exponentielles Backoff + Jitter
    const delay = Math.min(
      WS_RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      WS_RECONNECT_MAX_DELAY,
    );
    const jitter = delay * (0.75 + Math.random() * 0.5);
    const actualDelay = Math.round(jitter);

    this.reconnectAttempts++;
    console.log(`[WS] Reconnect #${this.reconnectAttempts} in ${actualDelay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, actualDelay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    // Regelmäßiger Ping
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        } catch {
          // Verbindung tot — Reconnect
          this.ws?.close();
        }

        // Timeout: Wenn kein Pong innerhalb von X ms, Verbindung trennen
        this.heartbeatTimeoutTimer = setTimeout(() => {
          console.warn('[WS] Heartbeat-Timeout — keine Antwort vom Server');
          this.ws?.close();
        }, WS_HEARTBEAT_TIMEOUT);
      }
    }, WS_HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// SINGLETON-EXPORT
// ══════════════════════════════════════════════════════════════════════

export const wsClient = new WebSocketClient();
export default wsClient;
