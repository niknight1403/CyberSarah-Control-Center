// Express-Response wird als ExpressResponse aliastiert, damit der globale
// Fetch-Response-Typ (Response) ohne Namenskollision genutzt werden kann.
import type { Express, Request, Response as ExpressResponse } from "express";
import { ENV } from "./env";

/**
 * Sprint 73 — Server-seitiger Render-Proxy (/api/render/*).
 *
 * Der Browser/die APK ruft den Workspace-Service (Render) niemals direkt auf:
 * Cross-Origin-Fetches schlagen am CORS-Header des Services fehl ("Verbindung
 * fehlgeschlagen – CORS-Einschränkung"). Statt dessen leitet diese Route
 * Anfragen gleicher Herkunft serverseitig an den Workspace-Service weiter:
 *
 *   App  →  POST {API}/api/render/api/v1/agent/proposals
 *   Proxy →  POST {WORKSPACE_SERVICE_URL}/api/v1/agent/proposals
 *
 * Vorteile:
 * - Keine CORS-Blockade mehr (Anfrage bleibt gleicher Herkunft).
 * - Der Service-Zugriffstoken kann serverseitig gehalten werden
 *   (WORKSPACE_SERVICE_TOKEN) und muss nicht mehr in der App hinterlegt werden.
 * - Präzise Statusmeldungen: 503, wenn der Proxy nicht konfiguriert ist;
 *   502 mit Service-Antwort, wenn der Upstream antwortet aber fehlschlägt.
 *
 * Header-Weiterleitung: Content-Type, X-GitHub-Token sowie die X-AI-*-
 * Provider-Header des Workspace-Service-Protokolls. Der Authorization-Header
 * wird vom serverseitigen Token ersetzt (falls konfiguriert), andernfalls
 * unverändert durchgereicht.
 */

const FORWARDED_HEADER_ALLOWLIST = [
  "content-type",
  "x-github-token",
  "x-ai-provider",
  "x-ai-provider-key",
  "x-ai-provider-endpoint",
] as const;

const UPSTREAM_TIMEOUT_MS = 120_000;

function workspaceServiceUrl(): string {
  return ENV.workspaceServiceUrl;
}

function serverServiceToken(): string | null {
  return (
    process.env.WORKSPACE_SERVICE_TOKEN?.trim() ||
    process.env.SERVICE_ACCESS_TOKEN?.trim() ||
    null
  );
}

function buildUpstreamRequest(req: Request, upstreamBase: string, upstreamPath: string): RequestInit {
  const headers: Record<string, string> = {};
  for (const name of FORWARDED_HEADER_ALLOWLIST) {
    const value = req.headers[name];
    if (typeof value === "string" && value.trim()) headers[name] = value;
  }
  const token = serverServiceToken();
  const clientAuthorization = req.headers.authorization;
  if (token) {
    headers.authorization = `Bearer ${token}`;
  } else if (typeof clientAuthorization === "string" && clientAuthorization.trim()) {
    headers.authorization = clientAuthorization;
  }
  const method = req.method.toUpperCase();
  const hasBody = method === "POST" || method === "PUT" || method === "PATCH";
  return {
    method,
    headers,
    body: hasBody ? JSON.stringify(req.body) : undefined,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    // redirect: "follow", — Fetch folgt Redirects standardmäßig.
  };
}

/**
 * Sprint 84-Follow-up: Render Free-Services schlafen nach 15 Minuten ein.
 * Waehrend des Cold-Starts antwortet Render sofort mit einer 502-HTML-Fehlerseite
 * (kein Timeout!) — der Proxy erkennt das am Status + Fehlen von JSON-Content-Type.
 */
function isRenderColdStart(response: Response): boolean {
  return (
    response.status === 502 &&
    !(response.headers.get("content-type") ?? "").includes("application/json")
  );
}

/** Wartezeit fuer den Cold-Start-Retry: deckt das Aufwachen (ca. 10-15 s) ab. */
const COLD_START_RETRY_DELAY_MS = 12_000;

/**
 * Sprint 88 — Direkter Server-zu-Workspace-Aufruf fuer den autonomen Chat-
 * Agenten (server/development-chat.ts). Nutzt dieselbe Cold-Start-Retry-
 * Logik wie der HTTP-Proxy, aber ohne den Umweg ueber einen eigenen
 * Express-Request/Response-Zyklus — der Agent-Tool-Aufruf laeuft im
 * selben Prozess direkt gegen den Workspace-Service.
 */
export type WorkspaceServiceCallResult =
  | { ok: true; status: number; json: unknown }
  | { ok: false; status: number; error: string };

export async function callWorkspaceService(
  path: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
): Promise<WorkspaceServiceCallResult> {
  const upstreamBase = workspaceServiceUrl();
  if (!upstreamBase) {
    return {
      ok: false,
      status: 503,
      error: "Render-Proxy nicht konfiguriert: Dem Server fehlt WORKSPACE_SERVICE_URL.",
    };
  }

  const upstreamPath = path.replace(/^\/api\/render/, "") || "/";
  const upstreamUrl = `${upstreamBase}${upstreamPath}`;
  const token = serverServiceToken();
  const headers: Record<string, string> = { "content-type": "application/json", ...(init.headers ?? {}) };
  if (token) headers.authorization = `Bearer ${token}`;

  const request: RequestInit = {
    method: init.method,
    headers,
    body: init.body,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  };

  try {
    let response = await fetch(upstreamUrl, request);
    if (isRenderColdStart(response)) {
      console.warn("[WorkspaceAgentTool] Cold-Start-502 vom Workspace-Service — Retry nach 12 s:", upstreamUrl);
      await new Promise((resolve) => setTimeout(resolve, COLD_START_RETRY_DELAY_MS));
      response = await fetch(upstreamUrl, request);
    }
    if (isRenderColdStart(response)) {
      return {
        ok: false,
        status: 503,
        error: "Der Workspace-Service wurde gerade aus dem Ruhemodus aufgeweckt und ist noch nicht bereit. Bitte in wenigen Sekunden erneut versuchen.",
      };
    }

    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
    }

    if (!response.ok) {
      const message =
        json && typeof json === "object" && json !== null && "error" in json && typeof (json as { error?: unknown }).error === "string"
          ? (json as { error: string }).error
          : `Workspace-Service antwortet mit ${response.status}.`;
      return { ok: false, status: response.status, error: message };
    }

    return { ok: true, status: response.status, json };
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      status: 502,
      error: isTimeout
        ? "Der Workspace-Service (Render) hat nicht rechtzeitig geantwortet — moeglicherweise Cold-Start."
        : "Der Workspace-Service (Render) ist nicht erreichbar.",
    };
  }
}

export function registerRenderProxy(app: Express) {
  app.all("/api/render/*splat", async (req: Request, res: ExpressResponse) => {
    const upstreamBase = workspaceServiceUrl();
    if (!upstreamBase) {
      res.status(503).json({
        error:
          "Render-Proxy nicht konfiguriert: Dem Server fehlt WORKSPACE_SERVICE_URL. Direkte Workspace-URL in den Einstellungen hinterlegen oder Umgebungsvariable setzen.",
      });
      return;
    }

    // req.url ist der volle Pfad ("/api/render/api/v1/...") inkl. Query-String —
    // der Proxy-Präfix wird entfernt, der Rest erreicht den Service unverändert.
    const upstreamPath = (req.url.replace(/^\/api\/render/, "") || "/");
    const upstreamUrl = `${upstreamBase}${upstreamPath}`;

    try {
      let upstreamResponse = await fetch(
        upstreamUrl,
        buildUpstreamRequest(req, upstreamBase, upstreamPath),
      );

      if (isRenderColdStart(upstreamResponse)) {
        console.warn("[RenderProxy] Cold-Start-502 vom Workspace-Service — Retry nach 12 s:", upstreamUrl);
        await new Promise((resolve) => setTimeout(resolve, COLD_START_RETRY_DELAY_MS));
        upstreamResponse = await fetch(
          upstreamUrl,
          buildUpstreamRequest(req, upstreamBase, upstreamPath),
        );
      }

      if (isRenderColdStart(upstreamResponse)) {
        res.status(503).json({
          error:
            "Der Workspace-Service wurde gerade aus dem Ruhemodus aufgeweckt und ist noch nicht bereit. Bitte in wenigen Sekunden erneut versuchen.",
        });
        return;
      }

      const contentType = upstreamResponse.headers.get("content-type") ?? "application/json";
      res.status(upstreamResponse.status);
      res.set("Content-Type", contentType);
      res.set("Cache-Control", "no-store");

      if (contentType.includes("application/json")) {
        const payload = await upstreamResponse.text();
        res.send(payload);
        return;
      }
      // Binär/Text-Antworten (Seltener Fall) byteweise durchreichen.
      const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
      res.send(buffer);
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "TimeoutError";
      const message = isTimeout
        ? "Der Workspace-Service (Render) hat nicht rechtzeitig geantwortet — möglicherweise Cold-Start. Bitte in wenigen Sekunden erneut versuchen."
        : "Der Workspace-Service (Render) ist nicht erreichbar. Prüfe Service-Status und URL.";
      console.error("[RenderProxy] Upstream-Fehler:", upstreamUrl, error instanceof Error ? error.message : error);
      res.status(502).json({ error: message });
    }
  });
}
