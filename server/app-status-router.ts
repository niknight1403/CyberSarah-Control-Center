import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import {
  buildRuntimeStatusSnapshot,
  classifyRuntimeState,
  filterRuntimeLogs,
} from "../lib/live-status-logic";
import {
  clearRuntimeLogs,
  getRuntimeLogs,
  installRuntimeLogger,
} from "./runtime-logger";

/**
 * Sprint 66 — appStatusRouter: Laufzeit-Status und Konsolen-Logs als
 * tRPC-Endpunkte fuer das Live-Panel und den Chat-Agenten.
 *
 * status: protected (nur Zustand, URL, Latenz — keine Interna).
 * recentLogs: protected, eigene Sicht auf Server-Logs gefiltert.
 * clearLogs: admin — leert den In-Memory-Puffer (kein Restart).
 */

const BOOT_AT = Date.now();

async function pingWorkspace(): Promise<number | null> {
  const baseUrl = process.env.WORKSPACE_SERVICE_URL?.replace(/\/$/, "");
  if (!baseUrl) return null;
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) return null;
    return Date.now() - started;
  } catch {
    return null;
  }
}

export const appStatusRouter = router({
  status: protectedProcedure.query(async () => {
    installRuntimeLogger();
    const logs = getRuntimeLogs();
    const pingMs = await pingWorkspace();
    return buildRuntimeStatusSnapshot({
      input: {
        processUp: true,
        lastErrorAtMs: logs
          .filter((entry) => entry.level === "error")
          .at(-1)?.atMs,
        nowMs: Date.now(),
      },
      activeUrl: process.env.PUBLIC_APP_URL || "http://localhost:3000",
      port: parseInt(process.env.PORT || "3000", 10),
      connectionKind: "sse",
      pingMs,
      buffer: logs,
      serverUptimeMs: Date.now() - BOOT_AT,
    });
  }),

  recentLogs: protectedProcedure
    .input(
      z
        .object({
          levels: z.array(z.enum(["info", "warn", "error", "success"])).max(4).optional(),
          query: z.string().trim().max(200).optional(),
          limit: z.number().int().min(1).max(500).default(100),
        })
        .default({ limit: 100 }),
    )
    .query(({ input }) => {
      installRuntimeLogger();
      const filtered = filterRuntimeLogs(getRuntimeLogs(), {
        levels: input?.levels,
        query: input?.query,
      });
      return {
        entries: filtered.slice(-Math.min(input?.limit ?? 100, 500)).reverse(),
        total: filtered.length,
      };
    }),

  clearLogs: adminProcedure.mutation(() => {
    const removed = clearRuntimeLogs();
    return { removed, state: classifyRuntimeState({ processUp: true, nowMs: Date.now() }) };
  }),
});
