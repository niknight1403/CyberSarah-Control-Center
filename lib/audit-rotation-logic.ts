export type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  targetPath: string | null;
  timestampMs: number;
  metadata: Record<string, string | number | boolean | null>;
};

export type RotationConfig = {
  nowMs: number;
  maxEntries: number;
  maxAgeMs: number;
};

export type RotationResult = {
  kept: AuditEntry[];
  removedCount: number;
  reason: string;
};

/**
 * Kürzt das Audit-Log deterministisch: Einträge, die älter als `maxAgeMs`
 * sind, werden ebenso entfernt wie der Überlauf jenseits von `maxEntries`
 * (jüngste Einträge haben Vorrang). Ungültige Konfigurationen werden
 * abgelehnt.
 */
export function rotateAuditLog(entries: AuditEntry[], config: RotationConfig): RotationResult {
  if (!Array.isArray(entries)) {
    throw new Error("Audit-Einträge müssen ein Array sein.");
  }
  const maxEntries = Number.isFinite(config.maxEntries) ? Math.floor(config.maxEntries) : 0;
  const maxAgeMs = Number.isFinite(config.maxAgeMs) ? Math.floor(config.maxAgeMs) : 0;
  if (maxEntries < 1) {
    throw new Error("Die maximale Eintragszahl muss mindestens 1 sein.");
  }
  if (maxAgeMs < 1) {
    throw new Error("Das maximale Alter muss mindestens 1 Millisekunde sein.");
  }

  const byRecency = [...entries].sort((a, b) => b.timestampMs - a.timestampMs || (a.id < b.id ? -1 : 1));
  const withinAge = byRecency.filter((entry) => config.nowMs - entry.timestampMs < maxAgeMs);
  const kept = withinAge.slice(0, maxEntries);
  const removedCount = entries.length - kept.length;

  const reason =
    removedCount === 0
      ? "Keine Rotation erforderlich."
      : `${removedCount} Eintrag${removedCount === 1 ? "" : "träge"} wurden nach Alter und Limit entfernt.`;

  return { kept, removedCount, reason };
}

const SENSITIVE_KEY_PATTERN = /token|key|secret|password|authorization|endpoint|url/i;

export type SanitizedAuditEntry = Omit<AuditEntry, "metadata"> & {
  metadata: Record<string, string | number | boolean | null>;
};

/**
 * Erzeugt eine exportfähige, tokenfreie Kopie eines Audit-Eintrags. Sensible
 * Metadaten-Schlüssel werden entfernt, freie Textwerte werden auf sensible
 * Muster geprüft und redigiert.
 */
export function sanitizeAuditEntry(entry: AuditEntry): SanitizedAuditEntry {
  const metadata: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(entry.metadata ?? {})) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }
    if (typeof value === "string" && (SENSITIVE_KEY_PATTERN.test(value) || /https?:\/\//.test(value))) {
      metadata[key] = "[redigiert]";
      continue;
    }
    metadata[key] = value;
  }
  return {
    ...entry,
    metadata,
  };
}

export type AuditExport = {
  exportedAtMs: number;
  entries: SanitizedAuditEntry[];
  redactedFieldCount: number;
};

/**
 * Exportiert das Audit-Log ohne sensible Werte und zählt die redigierten
 * Felder, damit der Export nachvollziehbar bleibt.
 */
export function exportAuditLog(entries: AuditEntry[], nowMs: number): AuditExport {
  const sanitized = entries.map(sanitizeAuditEntry);
  let redactedFieldCount = 0;
  for (const entry of sanitized) {
    const originalKeys = Object.keys(entries.find((candidate) => candidate.id === entry.id)?.metadata ?? {});
    redactedFieldCount += originalKeys.length - Object.keys(entry.metadata).length;
    redactedFieldCount += Object.values(entry.metadata).filter((value) => value === "[redigiert]").length;
  }
  return { exportedAtMs: nowMs, entries: sanitized, redactedFieldCount };
}
