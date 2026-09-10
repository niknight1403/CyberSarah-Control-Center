/**
 * Pure Logik fuer Heartbeat-Cron-Jobs (Forge-Service): deterministisch
 * testbar ohne Netz. server/_core/heartbeat.ts nutzt diese Funktionen
 * fuer Validierung und Body-Bau.
 */

export type HeartbeatJob = {
  name: string;
  /**
   * 6-Feld-Cron mit Sekunden (`sec min hour dom mon dow`), UTC, Mindestintervall 60s.
   * Sekundenfeld muss `0` sein — z. B. `"0 0 9 * * *"` = taeglich 09:00 UTC.
   */
  cron: string;
  /** Callback-Pfad. MUSS mit `/api/scheduled/` beginnen. */
  path: string;
  method?: "POST" | "PUT";
  payload?: unknown;
  description?: string;
};

/**
 * Update-Patch. Alle Felder optional; ungesetzt = unveraendert.
 * `enable`: true = resume, false = pause; weglassen = unveraendert.
 */
export type HeartbeatJobUpdate = Partial<Omit<HeartbeatJob, "name">> & {
  enable?: boolean;
};

export type HeartbeatValidation = { ok: true } | { ok: false; reason: string };

/** Serialisiert den Callback-Payload (undefined/null → "{}"). */
export function stringifyHeartbeatPayload(payload: unknown): string {
  if (payload === undefined || payload === null) return "{}";
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload);
}

/** Prueft, dass der Callback-Pfad mit /api/scheduled/ beginnt. */
export function validateHeartbeatPath(path: string): HeartbeatValidation {
  if (!path || !path.startsWith("/api/scheduled/")) {
    return {
      ok: false,
      reason: "callback path must start with /api/scheduled/",
    };
  }
  return { ok: true };
}

const CRON_RANGES: [string, number, number][] = [
  ["Sekunden", 0, 59],
  ["Minuten", 0, 59],
  ["Stunden", 0, 23],
  ["Tag des Monats", 1, 31],
  ["Monat", 1, 12],
  ["Wochentag", 0, 6],
];

/**
 * Prueft einen 6-Feld-Cron-Ausdruck mit Sekunden (Forge-Format):
 * 6 Felder, Sekundenfeld fest `0` (Mindestintervall 60s), erlaubte
 * Zeichen Ziffern, Stern, Bindestrich, Komma und Schraegstrich;
 */
export function validateHeartbeatCron(cron: string): HeartbeatValidation {
  if (typeof cron !== "string" || cron.trim() === "") {
    return { ok: false, reason: "cron expression fehlt." };
  }
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 6) {
    return {
      ok: false,
      reason: `cron muss 6 Felder haben (sec min hour dom mon dow), gefunden: ${fields.length}.`,
    };
  }
  if (fields[0] !== "0") {
    return {
      ok: false,
      reason: "Sekundenfeld muss 0 sein (Mindestintervall 60 Sekunden).",
    };
  }
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!/^[0-9*\-/]+$/.test(field)) {
      return {
        ok: false,
        reason: `Ungueltige Zeichen im Cron-Feld ${CRON_RANGES[i][0]}: "${field}".`,
      };
    }
    if (/^[0-9]+$/.test(field)) {
      const [, min, max] = CRON_RANGES[i];
      const value = Number(field);
      if (value < min || value > max) {
        return {
          ok: false,
          reason: `${CRON_RANGES[i][0]} ausserhalb des Bereichs ${min}-${max}: "${field}".`,
        };
      }
    }
  }
  return { ok: true };
}

/** Baut den CreateHeartbeatJob-Body aus einem Job-Objekt. */
export function buildHeartbeatCreateBody(job: HeartbeatJob): Record<string, unknown> {
  return {
    name: job.name,
    cronExpression: job.cron,
    callbackPath: job.path,
    callbackMethod: job.method ?? "POST",
    callbackPayload: stringifyHeartbeatPayload(job.payload),
    description: job.description ?? "",
  };
}

/** Baut den UpdateHeartbeatJob-Body — nur gesetzte Patch-Felder. */
export function buildHeartbeatUpdateBody(
  taskUid: string,
  patch: HeartbeatJobUpdate
): Record<string, unknown> {
  const body: Record<string, unknown> = { taskUid };
  if (patch.cron !== undefined) body.cronExpression = patch.cron;
  if (patch.path !== undefined) body.callbackPath = patch.path;
  if (patch.method !== undefined) body.callbackMethod = patch.method;
  if (patch.payload !== undefined) {
    body.callbackPayload = stringifyHeartbeatPayload(patch.payload);
  }
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.enable !== undefined) body.enable = patch.enable;
  return body;
}

/** Mappt den Forge-HTTP-Status auf einen tRPC-Fehlercode. */
export function mapHeartbeatStatus(
  status: number
):
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_SERVER_ERROR" {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 400 || status === 422) return "BAD_REQUEST";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "TOO_MANY_REQUESTS";
  return "INTERNAL_SERVER_ERROR";
}
