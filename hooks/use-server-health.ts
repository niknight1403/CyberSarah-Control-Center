import { useEffect, useState } from "react";

import { getApiBaseUrl } from "@/constants/oauth";
import type { ServerHealth } from "@/lib/dual-sidebar-logic";

/**
 * Sprint 200 — echter Server-Health-Poll fuer die Dual-Sidebar.
 *
 * Fragt den oeffentlichen /api/Health-Endpunkt des App-Servers ab
 * (kein Auth, kein DB-Zugriff): 200 => online, sonst offline.
 * Erster Zustand ist "checking" — die Sidebar behauptet nichts, was
 * sie nicht beobachtet hat. Timeout 4 s, Poll alle 60 s, Aufräumen per
 * AbortController. Laeuft ausschliesslich, solange die Komponente
 * gemountet ist (Wide-Viewport, Web).
 */

const HEALTH_TIMEOUT_MS = 4_000;
const HEALTH_POLL_INTERVAL_MS = 60_000;

export function useServerHealth(): ServerHealth {
  const [health, setHealth] = useState<ServerHealth>("checking");

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/health`, { signal: controller.signal });
        if (!disposed) setHealth(response.ok ? "online" : "offline");
      } catch {
        if (!disposed) setHealth("offline");
      } finally {
        clearTimeout(timer);
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), HEALTH_POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  return health;
}
