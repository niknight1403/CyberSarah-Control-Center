import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppState } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import { probeMobileReadiness } from "@/lib/mobile-readiness-client";
import { describeMobileReadiness } from "@/lib/mobile-readiness-logic";

const POLL_MS = 60_000;
const FRESHNESS_TICK_MS = 15_000;

/** Shared React Query key deduplicates the header + drawer probes. */
export function useMobileReadiness() {
  const baseUrl = getApiBaseUrl();
  const [active, setActive] = useState(AppState.currentState !== "background");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      if (state === "active") setNowMs(Date.now());
    });
    return () => listener.remove();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), FRESHNESS_TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const query = useQuery({
    queryKey: ["mobile-api-db-readiness", baseUrl],
    queryFn: () => probeMobileReadiness({ baseUrl }),
    enabled: active,
    retry: false,
    staleTime: 30_000,
    refetchInterval: active ? POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const view = useMemo(
    () => describeMobileReadiness(query.data ?? null, nowMs),
    [query.data, nowMs],
  );

  return {
    view,
    isChecking: query.isFetching,
    refresh: () => { if (active && !query.isFetching) void query.refetch(); },
  };
}
