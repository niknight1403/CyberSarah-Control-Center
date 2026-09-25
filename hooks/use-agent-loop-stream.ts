/**
 * Sprint 354 — useAgentLoopStream: Live-Telemetrie-Hook.
 * Verbindet sich per XHR-Streaming (React-Native-inkrementell) auf
 * GET /api/agentic-loops/:sessionId/stream (SSE, Sprint 353).
 * Verbindungssicherheit:
 *  - Auto-Reconnect mit exponentiellem Backoff (1s → 16s) und
 *    Last-Event-ID — verpasste Events kommen per Replay lueckenlos zurueck.
 *  - Dedupe im Stream-Logik-Layer verhindert Duplikate nach Reconnect.
 *  - Ein einziger zustandsarray pro Event-Batch haelt Re-Renders klein;
 *    View-Model wird memoisiert abgeleitet.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  appendLoopEvent,
  buildAgentLoopViewModel,
  normalizeAgentLoopFrame,
  parseSseChunk,
  reconnectDelayMs,
  type AgentLoopStreamEvent,
  type AgentLoopViewModel,
} from "@/lib/agent-loop-stream-logic";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

export type AgentLoopConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

export type UseAgentLoopStreamOptions = {
  sessionId: string;
  enabled?: boolean;
  baseUrl?: string;
  /** Injizierbarer Token-Lieferant (Tests koennen ihn stubben). */
  getSessionToken?: () => Promise<string | null>;
  /** Injizierbares XHR (Tests koennen einen Fake treiben). */
  xhrFactory?: () => XMLHttpRequest;
};

export type UseAgentLoopStreamResult = {
  connectionState: AgentLoopConnectionState;
  viewModel: AgentLoopViewModel;
  events: readonly AgentLoopStreamEvent[];
  attempts: number;
  reconnect: () => void;
};

const MAX_TRAIL = 60;

export function useAgentLoopStream(options: UseAgentLoopStreamOptions): UseAgentLoopStreamResult {
  const { sessionId, enabled = true } = options;
  const baseUrl = options.baseUrl ?? getApiBaseUrl();
  const getSessionToken = options.getSessionToken ?? Auth.getSessionToken;
  const xhrFactory = options.xhrFactory ?? (() => new XMLHttpRequest());

  const [connectionState, setConnectionState] = useState<AgentLoopConnectionState>("idle");
  const [events, setEvents] = useState<AgentLoopStreamEvent[]>([]);
  const [attempts, setAttempts] = useState(0);

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const bufferRef = useRef("");
  const consumedRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const lastEventIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const ingestFrames = useCallback((frames: ReturnType<typeof parseSseChunk>["frames"]) => {
    const normalized = frames.map(normalizeAgentLoopFrame).filter((event): event is AgentLoopStreamEvent => event !== null);
    if (normalized.length === 0) return;
    setEvents((previous) => {
      let next = previous;
      for (const event of normalized) {
        lastEventIdRef.current = Math.max(lastEventIdRef.current ?? 0, event.id);
        next = appendLoopEvent(next, event);
      }
      return next;
    });
  }, []);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (xhrRef.current) {
      xhrRef.current.onprogress = null;
      xhrRef.current.onload = null;
      xhrRef.current.onerror = null;
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    bufferRef.current = "";
    consumedRef.current = 0;
  }, []);

  const openStream = useCallback(async () => {
    if (!mountedRef.current) return;
    cleanup();
    attemptRef.current += 1;
    setAttempts(attemptRef.current);
    setConnectionState(attemptRef.current > 1 ? "reconnecting" : "connecting");

    const headers: Record<string, string> = { Accept: "text/event-stream" };
    const token = await getSessionToken().catch(() => null);
    if (token) headers.Authorization = `Bearer ${token}`;
    if (lastEventIdRef.current !== null) headers["Last-Event-ID"] = String(lastEventIdRef.current);

    const xhr = xhrFactory();
    xhrRef.current = xhr;
    xhr.open("GET", `${baseUrl}/api/agentic-loops/${encodeURIComponent(sessionId)}/stream`, true);
    xhr.responseType = "text";
    xhr.timeout = 0; // kein Request-Timeout: SSE-Heartbeat regelt das
    for (const [header, value] of Object.entries(headers)) xhr.setRequestHeader(header, value);

    xhr.onprogress = () => {
      // React Native liefert in onprogress nachwachsenden responseText —
      // wir fuettern nur das NEUE Stueck an den inkrementellen Parser.
      const full = xhr.responseText ?? "";
      if (full.length <= consumedRef.current) return;
      const chunk = full.slice(consumedRef.current);
      consumedRef.current = full.length;
      const parsed = parseSseChunk(bufferRef.current, chunk);
      bufferRef.current = parsed.rest;
      ingestFrames(parsed.frames);
      setConnectionState((state) => (state === "connecting" || state === "reconnecting" ? "connected" : state));
    };

    const scheduleReconnect = () => {
      if (!mountedRef.current) return;
      cleanup();
      setConnectionState((state) => (state === "idle" ? "idle" : "disconnected"));
      const delay = reconnectDelayMs(attemptRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        void openStream();
      }, delay);
    };

    xhr.onload = () => {
      // Server schliesst den Stream (Terminal-Event oder Timeout):
      // Restpuffer verarbeiten, dann geordnet neu verbinden.
      const full = xhr.responseText ?? "";
      if (full.length > consumedRef.current) {
        const parsed = parseSseChunk(bufferRef.current, full.slice(consumedRef.current));
        bufferRef.current = "";
        ingestFrames(parsed.frames);
      }
      scheduleReconnect();
    };
    xhr.onerror = scheduleReconnect;
    xhr.send();
  }, [baseUrl, cleanup, getSessionToken, ingestFrames, sessionId, xhrFactory]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      cleanup();
      setConnectionState("idle");
      return () => {
        mountedRef.current = false;
        cleanup();
      };
    }
    attemptRef.current = 0;
    lastEventIdRef.current = null;
    void openStream();
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup, enabled, openStream]);

  const reconnect = useCallback(() => {
    attemptRef.current = 0;
    void openStream();
  }, [openStream]);

  const viewModel = useMemo(() => buildAgentLoopViewModel(events, MAX_TRAIL), [events]);

  return { connectionState, viewModel, events, attempts, reconnect };
}
