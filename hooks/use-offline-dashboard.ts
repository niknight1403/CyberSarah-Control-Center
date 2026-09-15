/**
 * Sprint 119 — Offline-Pufferung des Daten-Hubs: Hook fuer das Dashboard.
 *
 * - Erfolgreiche Live-Antworten werden als Umschlag in AsyncStorage gepuffert.
 * - Bei Abfragefehler wird der Puffer einmalig geladen und — nur wenn er die
 *   strenge Validierung (lib/offline-cache-logic.ts) besteht — transparent
 *   als "cache" serviert.
 * - refresh() triggert eine echte Neuabfrage (kein Fake-Refresh).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import {
  buildOfflineCacheKey,
  parseOfflineCacheEnvelope,
  resolveOfflineDataState,
  serializeOfflineCacheEnvelope,
  type OfflineCacheEnvelope,
  type OfflineDataState,
} from "@/lib/offline-cache-logic";

const DASHBOARD_CACHE_SECTION = "dashboard";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type DataHubDashboardData = RouterOutputs["dataHub"]["dashboard"];

export function useOfflineDashboard(): OfflineDataState<DataHubDashboardData> & { refresh: () => void } {
  const query = trpc.dataHub.dashboard.useQuery();
  const [cachedEnvelope, setCachedEnvelope] = useState<OfflineCacheEnvelope<DataHubDashboardData> | null>(null);
  const [cacheLookupDone, setCacheLookupDone] = useState(false);
  const lastPersistedPayload = useRef<string>("");

  // Live-Daten puffern (normalisiert: gleiche Antwort nicht doppelt schreiben).
  useEffect(() => {
    if (query.data === undefined) return;
    const serialized = serializeOfflineCacheEnvelope(query.data, DASHBOARD_CACHE_SECTION, new Date());
    if (serialized === lastPersistedPayload.current) return;
    lastPersistedPayload.current = serialized;
    void AsyncStorage.setItem(buildOfflineCacheKey(DASHBOARD_CACHE_SECTION), serialized).catch(() => {
      // Puffer-Schreibfehler sind nicht fatal — Offline-Fallback fehlt dann ehrlich.
    });
  }, [query.data]);

  // Bei Fehler den Puffer einmalig laden (strikte Validierung in der Logik).
  useEffect(() => {
    if (!query.isError || cacheLookupDone) return;
    let cancelled = false;
    setCacheLookupDone(true);
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(buildOfflineCacheKey(DASHBOARD_CACHE_SECTION));
        const envelope = parseOfflineCacheEnvelope<DataHubDashboardData>(raw, DASHBOARD_CACHE_SECTION, Date.now());
        if (!cancelled && envelope !== null) setCachedEnvelope(envelope);
      } catch {
        // Lesefehler: kein Puffer, Fehlerzustand bleibt sichtbar.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query.isError, cacheLookupDone]);

  // Neuer Live-Erfolg nach Fehlzeitpunkt: Puffer-Anzeige zurücksetzen.
  useEffect(() => {
    if (query.data !== undefined) {
      setCachedEnvelope(null);
      setCacheLookupDone(false);
    }
  }, [query.data]);

  const state = useMemo<OfflineDataState<DataHubDashboardData>>(
    () =>
      resolveOfflineDataState({
        liveData: query.data ?? null,
        isLoading: query.isLoading,
        queryError: query.error,
        cachedEnvelope,
        // Date.now() im Memo: Zustand wird bei jeder Render-Entscheidung neu bewertet.
        nowMs: Date.now(),
      }),
    [query.data, query.isLoading, query.error, cachedEnvelope],
  );

  const refresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  return { ...state, refresh };
}
