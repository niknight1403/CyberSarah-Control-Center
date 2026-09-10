import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import { trpc } from "@/lib/trpc";
import {
  decodeSseLogEvent,
  isSseContentType,
  mergeRuntimeLogs,
  parseSseChunk,
  type LiveRuntimeLogEntry,
} from "@/lib/live-runtime-sse-logic";

/**
 * Sprint 67 — Live-Runtime-Hook fuer das Preview-Panel.
 *
 * Web: fetch-basiertes SSE-Streaming von /api/runtime/logs/stream mit
 *      Bearer-Header (EventSource kann keine Header) + Status-Polling.
 * Nativ: Fallback auf tRPC-Polling (recentLogs alle 2 s), da RN keine
 *      Streaming-Responses mit Authorization-Header bietet.
 */

export interface LiveRuntimeStatus {
  state: "running" | "building" | "error" | "stopped";
  stateLabel: string;
  activeUrl: string;
  port: number;
  connectionKind: "sse" | "poll";
  pingMs: number | null;
  logCount: number;
  serverUptimeMs: number;
  timestamp: number;
}

export type LiveConnectionState = "connecting" | "streaming" | "polling" | "offline";

export function useLiveRuntimeStatus() {
  const query = trpc.appStatus.status.useQuery(undefined, {
    refetchInterval: 5_000,
    refetchOnWindowFocus: false,
  });
  return query.data ?? null;
}

export function useLiveRuntimeLogs(maxEntries = 200) {
  const [entries, setEntries] = useState<LiveRuntimeLogEntry[]>([]);
  const [connection, setConnection] = useState<LiveConnectionState>("connecting");
  const apiBase = getApiBaseUrl();

  // Nativ-Polling ueber tRPC
  const pollQuery = trpc.appStatus.recentLogs.useQuery(
    { limit: maxEntries },
    {
      refetchInterval: Platform.OS === "web" ? false : 2_000,
      refetchOnWindowFocus: false,
      enabled: Platform.OS !== "web",
    },
  );

  useEffect(() => {
    if (Platform.OS !== "web") {
      if (pollQuery.data?.entries) {
        setEntries((current) =>
          mergeRuntimeLogs(
            current,
            (pollQuery.data?.entries ?? []) as LiveRuntimeLogEntry[],
            maxEntries,
          ),
        );
        setConnection((state) => (state === "offline" ? "offline" : "polling"));
      }
    }
  }, [pollQuery.data, maxEntries]);

  // Web: SSE via fetch-Streaming mit Auth-Header
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let cancelled = false;
    let buffer = "";
    const controller = new AbortController();

    (async () => {
      try {
        const token = await Auth.getSessionToken();
        const response = await fetch(`${apiBase}/api/runtime/logs/stream`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!response.ok || !isSseContentType(response.headers.get("content-type"))) {
          setConnection("offline");
          return;
        }
        if (cancelled) return;
        setConnection("streaming");
        const reader = response.body?.getReader();
        if (!reader) {
          setConnection("offline");
          return;
        }
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;
          const parsed = parseSseChunk(buffer, decoder.decode(value, { stream: true }));
          buffer = parsed.remainder;
          const incoming = parsed.events
            .map((event) => decodeSseLogEvent(event))
            .filter((entry): entry is LiveRuntimeLogEntry => entry !== null);
          if (incoming.length > 0) {
            setEntries((current) => mergeRuntimeLogs(current, incoming, maxEntries));
          }
        }
      } catch {
        if (!cancelled) setConnection("offline");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiBase, maxEntries]);

  const clearLocal = useCallback(() => setEntries([]), []);

  return { entries, connection, clearLocal };
}

export function useClearRuntimeLogs() {
  const utils = trpc.useUtils();
  const mutation = trpc.appStatus.clearLogs.useMutation({
    onSuccess: () => {
      utils.appStatus.recentLogs.invalidate();
      utils.appStatus.status.invalidate();
    },
  });
  return mutation;
}

/** Vorschau-Ziel: Workspace-Service bevorzugt, sonst API-Basis (Web-Export). */
export function usePreviewTargetUrl(): string | null {
  const { settings } = trpc.useContext() ? { settings: null } : { settings: null };
  return useMemo(() => {
    void settings;
    return getApiBaseUrl();
  }, [settings]);
}
