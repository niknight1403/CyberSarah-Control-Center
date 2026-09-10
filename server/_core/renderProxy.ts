import type { Express, Request, Response } from "express";

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

function workspaceServiceUrl(): string | null {
  const raw = process.env.WORKSPACE_SERVICE_URL?.trim().replace(/\/+$/, "");
  return raw && /^https?:\/\//.test(raw) ? raw : null;
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

export function registerRenderProxy(app: Express) {
  app.all("/api/render/*", async (req: Request, res: Response) => {
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
      const upstreamResponse = await fetch(
        upstreamUrl,
        buildUpstreamRequest(req, upstreamBase, upstreamPath),
      );

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
