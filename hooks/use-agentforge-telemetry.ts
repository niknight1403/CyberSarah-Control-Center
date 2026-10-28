/**
 * Live Agentforge swarm telemetry for the CyberSarah control dashboard.
 * Uses the authenticated SSE endpoint and only renders server-approved metadata.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import { parseSseChunk, reconnectDelayMs } from "@/lib/agent-loop-stream-logic";

const EVENT_TYPES = new Set(["task.created", "task.updated", "agent.step.started", "agent.failed", "tool.executed", "checkpoint.saved", "llm.completed", "llm.failed"]);
export type AgentforgeTelemetryEvent = { id: number; type: string; at: number; metadata: Record<string, unknown> };
export type AgentforgeTelemetryState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

export function useAgentforgeTelemetry(enabled: boolean) {
  const [events, setEvents] = useState<AgentforgeTelemetryEvent[]>([]);
  const [connectionState, setConnectionState] = useState<AgentforgeTelemetryState>("idle");
  const [attempts, setAttempts] = useState(0);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufferRef = useRef("");
  const consumedRef = useRef(0);
  const lastEventIdRef = useRef(0);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
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

  const open = useCallback(async () => {
    if (!mountedRef.current) return;
    cleanup();
    attemptRef.current += 1;
    setAttempts(attemptRef.current);
    setConnectionState(attemptRef.current > 1 ? "reconnecting" : "connecting");
    const headers: Record<string, string> = { Accept: "text/event-stream" };
    const token = await Auth.getSessionToken().catch(() => null);
    if (!mountedRef.current) return;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (lastEventIdRef.current > 0) headers["Last-Event-ID"] = String(lastEventIdRef.current);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("GET", `${getApiBaseUrl()}/api/agentforge/stream`, true);
    xhr.responseType = "text";
    xhr.timeout = 0;
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);

    const ingest = (chunk: string) => {
      const parsed = parseSseChunk(bufferRef.current, chunk);
      bufferRef.current = parsed.rest;
      const accepted: AgentforgeTelemetryEvent[] = [];
      for (const frame of parsed.frames) {
        if (frame.id == null || !Number.isSafeInteger(frame.id) || frame.id <= lastEventIdRef.current || !EVENT_TYPES.has(String(frame.event))) continue;
        if (!frame.data || typeof frame.data !== "object" || Array.isArray(frame.data)) continue;
        const body = frame.data as Record<string, unknown>;
        const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {};
        accepted.push({ id: frame.id, type: String(frame.event), at: Number(body.at) || Date.now(), metadata });
      }
      if (!accepted.length) return;
      setEvents((previous) => [...previous, ...accepted].sort((a, b) => a.id - b.id).slice(-60));
      lastEventIdRef.current = Math.max(lastEventIdRef.current, ...accepted.map((event) => event.id));
    };
    const reconnect = () => {
      if (!mountedRef.current) return;
      cleanup();
      setConnectionState("disconnected");
      timerRef.current = setTimeout(() => { void open(); }, reconnectDelayMs(attemptRef.current));
    };
    xhr.onprogress = () => {
      const full = xhr.responseText ?? "";
      if (full.length <= consumedRef.current) return;
      const chunk = full.slice(consumedRef.current);
      consumedRef.current = full.length;
      ingest(chunk);
      setConnectionState("connected");
    };
    xhr.onload = reconnect;
    xhr.onerror = reconnect;
    xhr.send();
  }, [cleanup]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      cleanup();
      setEvents([]);
      setConnectionState("idle");
      return () => { mountedRef.current = false; cleanup(); };
    }
    attemptRef.current = 0;
    lastEventIdRef.current = 0;
    setEvents([]);
    void open();
    return () => { mountedRef.current = false; cleanup(); };
  }, [cleanup, enabled, open]);

  return { events, connectionState, attempts };
}
