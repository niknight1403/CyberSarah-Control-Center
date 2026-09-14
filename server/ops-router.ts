/**
 * Sprint 56 — Betriebsuebersichts-Router: reale Pruefungen, aggregiert
 * ueber lib/ops-overview-logic.ts. Admin-geschuetzt, tokenfreie Meldungen.
 * Sprint 110 — Erweitert um PaaS-Betriebspfade: Render-Deploy-Status
 * (key-gated), Neon-Postgres-Roundtrip, Uptime-Waechter-Ergebnis (24 h)
 * und Workspace-Modus — plus Stufenwechsel-Alarmierung via server/ops-alerts.
 */
import { buildOpsOverview, type OpsCheckInput } from "../lib/ops-overview-logic";
import {
  classifyNeonLatency,
  classifyRenderDeployState,
  classifyUptimeWatcherState,
} from "../lib/ops-paas-logic";
import { checkDatabaseHealth, tableRowCounts } from "./db";
import { adminProcedure, router } from "./_core/trpc";
import { resolveManagedLlmEndpoint, type ManagedLlmEnv } from "../lib/managed-llm-fallback-logic";
import { buildBackupManifest } from "../lib/db-backup-manifest-logic";
import {
  COLD_START_RETRY_DELAYS_MS,
  classifyWorkspaceFailure,
} from "../lib/workspace-coldstart-logic";
import { evaluateOpsTransitionsAndAlert, getLastFailure } from "./ops-alerts";

const WORKSPACE_PROBE_TIMEOUT_MS = 3_000;
const RENDER_PROBE_TIMEOUT_MS = 5_000;
const UPTIME_PROBE_TIMEOUT_MS = 5_000;
const UPTIME_DEFAULT_REPO = "niknight1403/CyberSarah-Control-Center";

async function probeWorkspace(): Promise<OpsCheckInput> {
  const baseUrl = process.env.WORKSPACE_SERVICE_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    return { kind: "workspace", state: "unknown" };
  }
  const started = Date.now();
  const classifyError = (error: unknown): { status?: number; code?: string } => {
    if (error instanceof Error && "code" in error && typeof (error as { code?: string }).code === "string") {
      return { code: (error as { code: string }).code };
    }
    if (error instanceof TypeError) return { code: "ECONNREFUSED" };
    return {};
  };
  for (let attempt = 0; attempt <= COLD_START_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`, {
        signal: AbortSignal.timeout(WORKSPACE_PROBE_TIMEOUT_MS),
      });
      // Sprint 110: Health-Antwort auswerten — Modus (postgres/ephemeral)
      // ist Teil der zentralen Betriebsansicht (Sprint 85: ephemerale
      // WIP-Speicherung gilt es frueh zu erkennen).
      let modeDetail = "";
      let mode = "";
      try {
        const body = (await response.json()) as { mode?: unknown };
        if (typeof body.mode === "string" && body.mode.length > 0) {
          mode = body.mode;
          modeDetail = ` · Modus: ${body.mode}${body.mode === "postgres" ? " (persistent)" : ""}`;
        }
      } catch {
        // Health-Antwort ohne JSON-Koerper — HTTP-Status genuegt.
      }
      const state = response.ok ? (mode && mode !== "postgres" ? "degraded" : "ok") : "degraded";
      return {
        kind: "workspace",
        state,
        ageMs: Date.now() - started,
        detail: `HTTP ${response.status}${modeDetail}${attempt > 0 ? ` (nach Kaltstart-Retry ${attempt})` : ""}`,
      };
    } catch (error) {
      const failure = classifyError(error);
      if (attempt >= COLD_START_RETRY_DELAYS_MS.length) {
        const kind = classifyWorkspaceFailure(failure);
        return {
          kind: "workspace",
          state: kind === "coldStart" ? "unknown" : "down",
          ageMs: Date.now() - started,
          detail:
            kind === "coldStart"
              ? "Kaltstart vermutet, alle Retries erschoepft — Dienst weckt vermutlich gerade auf"
              : error instanceof Error
                ? error.name
                : "Verbindungsfehler",
        };
      }
      await new Promise((resolve) => setTimeout(resolve, COLD_START_RETRY_DELAYS_MS[attempt]));
    }
  }
  return { kind: "workspace", state: "down", detail: "unerreichbar" };
}

/** Sprint 110: Render-Deploy-Status via Render-API — ohne Key ehrlich "unknown". */
async function probeRenderDeploy(): Promise<OpsCheckInput> {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  if (!apiKey) {
    const result = classifyRenderDeployState(null);
    return { kind: "renderDeploy", state: result.state, detail: result.detail };
  }
  try {
    const headers = {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    };
    const servicesResponse = await fetch("https://api.render.com/v1/services?limit=20", {
      headers,
      signal: AbortSignal.timeout(RENDER_PROBE_TIMEOUT_MS),
    });
    if (!servicesResponse.ok) {
      return {
        kind: "renderDeploy",
        state: "unknown",
        detail: `Render-API antwortete mit HTTP ${servicesResponse.status}`,
      };
    }
    const services = (await servicesResponse.json()) as Array<{
      id: string;
      type: string;
      name?: string;
    }>;
    const wantedId = process.env.RENDER_SERVICE_ID?.trim();
    const service = wantedId
      ? services.find((entry) => entry.id === wantedId)
      : services.find((entry) => entry.type === "web" || entry.type === "web_service");
    if (!service) {
      return {
        kind: "renderDeploy",
        state: "unknown",
        detail: "kein passender Render-Service gefunden (RENDER_SERVICE_ID prüfbar)",
      };
    }
    const deploysResponse = await fetch(
      `https://api.render.com/v1/services/${service.id}/deploys?limit=1`,
      { headers, signal: AbortSignal.timeout(RENDER_PROBE_TIMEOUT_MS) },
    );
    if (!deploysResponse.ok) {
      return {
        kind: "renderDeploy",
        state: "unknown",
        detail: `Deploy-Abfrage antwortete mit HTTP ${deploysResponse.status}`,
      };
    }
    const deploys = (await deploysResponse.json()) as Array<{ status?: string }>;
    const status = deploys[0]?.status ?? null;
    const result = classifyRenderDeployStatusFallback(status);
    return { kind: "renderDeploy", state: result.state, detail: result.detail };
  } catch (error) {
    return {
      kind: "renderDeploy",
      state: "unknown",
      detail: `Render-API nicht erreichbar: ${error instanceof Error ? error.name : "Netzwerkfehler"}`,
    };
  }
}

/**
 * Klassifiziert den abgefragten Deploy-Status — ohne Treffer ehrlich
 * "unbekannt" statt geratener "live".
 */
function classifyRenderDeployStatusFallback(status: string | null) {
  return classifyRenderDeployState(status);
}

/** Sprint 110: Uptime-Waechter-Ergebnis aus den Alarm-Issues (24-h-Fenster). */
async function probeUptimeWatcher(): Promise<OpsCheckInput> {
  const repo = process.env.OPS_UPTIME_REPO?.trim() || UPTIME_DEFAULT_REPO;
  const fetchIssues = async (state: "open" | "closed") => {
    const url = `https://api.github.com/repos/${repo}/issues?labels=uptime-alert&state=${state}&sort=updated&direction=desc&per_page=5`;
    const response = await fetch(url, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(UPTIME_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as Array<{ updated_at?: string }>;
  };
  try {
    const openIssues = await fetchIssues("open");
    if (openIssues === null) {
      const result = classifyUptimeWatcherState({ openAlert: null });
      return { kind: "uptimeWatcher", state: result.state, detail: result.detail };
    }
    let recoveredWithinMs: number | null = null;
    const closedIssues = await fetchIssues("closed");
    if (closedIssues !== null && closedIssues.length > 0) {
      const updated = closedIssues[0]?.updated_at ? Date.parse(closedIssues[0].updated_at) : NaN;
      if (!Number.isNaN(updated)) {
        recoveredWithinMs = Date.now() - updated;
      }
    }
    const result = classifyUptimeWatcherState({
      openAlert: openIssues.length > 0,
      recoveredWithinMs,
    });
    return { kind: "uptimeWatcher", state: result.state, detail: result.detail };
  } catch (error) {
    return {
      kind: "uptimeWatcher",
      state: "unknown",
      detail: `GitHub nicht erreichbar: ${error instanceof Error ? error.name : "Netzwerkfehler"}`,
    };
  }
}

function probeChat(): OpsCheckInput {
  // Sprint 108: Zero-Cost-Prioritaet — die Ops-Check meldet den aktiven
  // Endpoint der Gratis-Kette (Groq > OpenRouter > Gemini) vor den Paid-Stufen.
  const env: ManagedLlmEnv = {
    forgeApiUrl: process.env.AI_FORGE_API_URL?.trim() || undefined,
    forgeApiKey: process.env.AI_FORGE_API_KEY?.trim() || undefined,
    openaiBaseUrl: process.env.AI_OPENAI_BASE_URL?.trim() || undefined,
    openaiApiKey:
      process.env.AI_OPENAI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || undefined,
    groqApiKey: process.env.AI_GROQ_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim() || undefined,
    openrouterApiKey:
      process.env.AI_OPENROUTER_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim() || undefined,
  };
  const endpoint = resolveManagedLlmEndpoint(env);
  if (endpoint) {
    return { kind: "chat", state: "ok", detail: `Managed-LLM: ${endpoint.source}` };
  }
  return {
    kind: "chat",
    state: "degraded",
    detail: "kein KI-Key konfiguriert (Groq/OpenRouter/Gemini/Forge/OpenAI)",
  };
}

/** Fuegt Zeitstempel und letztes Fehlerbild an alle Pruefungen an. */
function withSprint110Fields(inputs: OpsCheckInput[], now: number): OpsCheckInput[] {
  return inputs.map((input) => {
    const failure = getLastFailure(input.kind);
    return {
      ...input,
      checkedAt: input.checkedAt ?? now,
      lastFailure: failure?.detail ?? null,
    };
  });
}

export const opsRouter = router({
  overview: adminProcedure.query(async () => {
    const startedAt = Date.now();
    const dbProbeStarted = Date.now();
    const databaseOk = await checkDatabaseHealth();
    const dbLatencyMs = databaseOk ? Date.now() - dbProbeStarted : null;
    const neonResult = classifyNeonLatency(databaseOk ? dbLatencyMs : null);
    const now = Date.now();

    const [coreInputs, workspace, renderDeploy, uptimeWatcher] = await Promise.all([
      Promise.resolve<OpsCheckInput[]>([
        { kind: "apiHealth", state: "ok", ageMs: 0 },
        { kind: "apiReady", state: databaseOk ? "ok" : "degraded", ageMs: 0 },
        {
          kind: "database",
          state: databaseOk ? "ok" : "down",
          ageMs: Date.now() - startedAt,
        },
        {
          kind: "neonPostgres",
          state: neonResult.state,
          detail: neonResult.detail,
          ageMs: Date.now() - dbProbeStarted,
        },
      ]),
      probeWorkspace(),
      probeRenderDeploy(),
      probeUptimeWatcher(),
    ]);

    const inputs: OpsCheckInput[] = [
      ...coreInputs,
      workspace,
      renderDeploy,
      uptimeWatcher,
      probeChat(),
      { kind: "metrics", state: "unknown" },
    ];

    const overview = buildOpsOverview(withSprint110Fields(inputs, now));

    // Sprint 110: Stufenwechsel zu kritisch -> Discord-Admin-Alarm
    // (key-gated, ehrlich "nur im Dashboard sichtbar" ohne Webhook).
    await evaluateOpsTransitionsAndAlert(overview);

    return overview;
  }),
  // Sprint 69: Workspace-Service-URL fuer das Admin-Autosetup — der Client
  // kann die Service-Adresse selbst nicht kennen; der Server kennt sie aus ENV.
  workspaceServiceUrl: adminProcedure.query(() => ({
    url: process.env.WORKSPACE_SERVICE_URL?.trim().replace(/\/$/, "") ?? null,
    // Sprint 73: Render-Proxy aktiv, sobald der Server die Service-Adresse kennt.
    proxyUrl: process.env.WORKSPACE_SERVICE_URL?.trim() ? "/api/render" : null,
  })),
  backupManifest: adminProcedure.query(async () => {
    const tableCounts = await tableRowCounts();
    return buildBackupManifest({
      label: process.env.DB_LABEL || "production",
      tableCounts,
      generatedAt: new Date(),
    });
  }),
});
