/**
 * Sprint 69 — JSON-Antwort-Sicherheit (Frontend).
 *
 * Problem: Backend-Fehlerseiten (SPA-Fallback, Proxy-404/500, Express-Default)
 * liefern HTML statt JSON. Ein ungeschütztes `response.json()` wirft dann
 * "Unexpected token '<', <!DOCTYPE ...>" und verschluckt die eigentliche
 * Fehlerursache. Dieses Modul prueft Content-Type und Status VOR dem Parsing
 * und erzeugt deterministische, sprechende Fehler.
 */

export const JSON_CONTENT_TYPE_PREFIX = "application/json";

/** bodySnippet-Grenze fuer Fehlermeldungen (keine riesigen HTML-Seiten loggen). */
export const BODY_SNIPPET_MAX_LENGTH = 200;

export function isJsonContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const normalized = contentType.toLowerCase().trim();
  return normalized.startsWith(JSON_CONTENT_TYPE_PREFIX);
}

export type NonJsonResponseContext = {
  status: number;
  contentType: string | null | undefined;
  url?: string;
  bodySnippet?: string;
};

/**
 * Baut die Fehlermeldung fuer eine Nicht-JSON-Antwort. Fassbar ohne
 * Fachjargon, inkl. Hinweis auf die typischen Ursachen.
 */
export function describeNonJsonResponse(context: NonJsonResponseContext): string {
  const status = Number.isFinite(context.status) ? context.status : 0;
  const contentType = (context.contentType ?? "unbekannt").trim() || "unbekannt";
  const where = context.url ? ` (${context.url})` : "";
  const snippet = (context.bodySnippet ?? "").replace(/\s+/g, " ").trim().slice(0, BODY_SNIPPET_MAX_LENGTH);
  const base = `Der Server hat keine JSON-Antwort geliefert${where}: HTTP ${status}, Content-Type "${contentType}".`;
  const hint =
    status === 404
      ? " Der aufgerufene Endpunkt existiert auf diesem Server nicht (vermutlich alte Server-Version oder falsche Service-URL)."
      : status >= 500
        ? " Der Server meldet einen internen Fehler — Seite ist keine API-Antwort."
        : "";
  return snippet ? `${base}${hint} Antwortbeginn: ${snippet}` : `${base}${hint}`;
}

/**
 * Prueft eine fetch-Response und parst sie nur als JSON, wenn Header und
 * Status plausibel sind. Wirft sonst einen sprechenden Fehler.
 */
export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers?.get?.("content-type") ?? null;
  // Content-Type "unbekannt" (Mock-Umgebung/minimale Response) wird toleriert;
  // bekanntes Nicht-JSON (z. B. text/html) faellt in die Fehlermeldung.
  const isNonJson = contentType != null && !isJsonContentType(contentType);
  if (!response.ok || isNonJson) {
    let bodySnippet: string | undefined;
    try {
      bodySnippet = await response.text();
    } catch {
      bodySnippet = undefined;
    }
    throw new Error(
      describeNonJsonResponse({
        status: response.status,
        contentType,
        url: response.url || undefined,
        bodySnippet,
      }),
    );
  }
  return (await response.json()) as T;
}

/**
 * Wrapper fuer fetch-Aufrufe, die tRPC/REST-Endpunkte treffen: leitet die
 * Response nur weiter, wenn sie JSON ist — tRPC/API-Client-Fehler bleiben
 * dann strukturiert, statt als HTML-Parse-Exception zu explodieren.
 */
export async function assertJsonFetchResponse(response: Response): Promise<Response> {
  const contentType = response.headers?.get?.("content-type") ?? null;
  if (!isJsonContentType(contentType)) {
    let bodySnippet: string | undefined;
    try {
      bodySnippet = await response.text();
    } catch {
      bodySnippet = undefined;
    }
    throw new Error(
      describeNonJsonResponse({
        status: response.status,
        contentType,
        url: response.url || undefined,
        bodySnippet,
      }),
    );
  }
  return response;
}
