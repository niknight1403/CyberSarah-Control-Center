/**
 * Sprint 56 — Betriebsuebersichts-Router: reale Pruefungen, aggregiert
 * ueber lib/ops-overview-logic.ts. Admin-geschuetzt, tokenfreie Meldungen.
 */
import { buildOpsOverview, type OpsCheckInput } from "../lib/ops-overview-logic";
import { checkDatabaseHealth, tableRowCounts } from "./db";
import { adminProcedure, router } from "./_core/trpc";
import { resolveManagedLlmEndpoint, type ManagedLlmEnv } from "../lib/managed-llm-fallback-logic";
import { buildBackupManifest } from "../lib/db-backup-manifest-logic";

const WORKSPACE_PROBE_TIMEOUT_MS = 3_000;

async function probeWorkspace(): Promise<OpsCheckInput> {
  const baseUrl = process.env.WORKSPACE_SERVICE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    return { kind: "workspace", state: "unknown" };
  }
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/v1/health`, {
      signal: AbortSignal.timeout(WORKSPACE_PROBE_TIMEOUT_MS),
    });
    const state = response.ok ? "ok" : "degraded";
    return {
      kind: "workspace",
      state,
      ageMs: Date.now() - started,
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      kind: "workspace",
      state: "down",
      detail: error instanceof Error ? error.name : "Verbindungsfehler",
    };
  }
}

function probeChat(): OpsCheckInput {
  const env: ManagedLlmEnv = {
    forgeApiUrl: process.env.AI_FORGE_API_URL?.trim() || undefined,
    forgeApiKey: process.env.AI_FORGE_API_KEY?.trim() || undefined,
    openaiBaseUrl: process.env.AI_OPENAI_BASE_URL?.trim() || undefined,
    openaiApiKey:
      process.env.AI_OPENAI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || undefined,
  };
  const endpoint = resolveManagedLlmEndpoint(env);
  if (endpoint) {
    return { kind: "chat", state: "ok", detail: `Managed-LLM: ${endpoint.source}` };
  }
  return {
    kind: "chat",
    state: "degraded",
    detail: "weder Forge-Key noch OpenAI-Fallback konfiguriert",
  };
}

export const opsRouter = router({
  overview: adminProcedure.query(async () => {
    const startedAt = Date.now();
    const databaseOk = await checkDatabaseHealth();

    const inputs: OpsCheckInput[] = [
      { kind: "apiHealth", state: "ok", ageMs: 0 },
      { kind: "apiReady", state: databaseOk ? "ok" : "degraded", ageMs: 0 },
      {
        kind: "database",
        state: databaseOk ? "ok" : "down",
        ageMs: Date.now() - startedAt,
      },
      await probeWorkspace(),
      probeChat(),
      { kind: "metrics", state: "unknown" },
    ];

    return buildOpsOverview(inputs);
  }),
  backupManifest: adminProcedure.query(async () => {
    const tableCounts = await tableRowCounts();
    return buildBackupManifest({
      label: process.env.DB_LABEL || "production",
      tableCounts,
      generatedAt: new Date(),
    });
  }),
});
