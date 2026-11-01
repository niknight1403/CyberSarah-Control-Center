/**
 * Sprint 358 — Audit-Log: administrative Aktionen nachvollziehbar.
 *
 * Lückenlose, manipulationssichere Protokollierung administrativer Eingriffe
 * mit Vorher-/Nachher-Zuständen, Schweregraden, Hash-Integritätsprüfung, PII-Maskierung
 * sowie Filterung und Export (JSON/CSV).
 */

export type AuditActionType =
  | "user_role_changed"
  | "user_status_changed"
  | "feature_flag_updated"
  | "playbook_executed"
  | "system_config_changed"
  | "security_secret_revoked"
  | "custom_admin_action";

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditActor {
  userId: string;
  email: string;
  role: string;
  ipAddress?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  actor: AuditActor;
  action: AuditActionType;
  resourceType: string;
  resourceId: string;
  severity: AuditSeverity;
  details: {
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    reason?: string;
    [key: string]: unknown;
  };
  checksum: string;
}

export interface CreateAuditEntryInput {
  actor: AuditActor;
  action: AuditActionType;
  resourceType: string;
  resourceId: string;
  severity?: AuditSeverity;
  details?: {
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    reason?: string;
    [key: string]: unknown;
  };
}

export interface AuditSearchQuery {
  actorUserId?: string;
  actionType?: AuditActionType | "all";
  severity?: AuditSeverity | "all";
  resourceType?: string;
  resourceId?: string;
  fromDateMs?: number;
  toDateMs?: number;
  searchTerm?: string;
}

/** Berechnet eine Prüfsumme (Integritäts-Hash) für einen Audit-Eintrag. */
export function calculateAuditChecksum(
  id: string,
  timestamp: number,
  actorUserId: string,
  action: string,
  resourceId: string
): string {
  const raw = `${id}:${timestamp}:${actorUserId}:${action}:${resourceId}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 33) ^ raw.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Erstellt einen neuen Audit-Log-Eintrag inklusive Prüfsumme. */
export function createAuditEntry(
  input: CreateAuditEntryInput,
  nowMs: number = Date.now()
): AuditLogEntry {
  const id = `audit-${nowMs}-${Math.random().toString(36).substring(2, 7)}`;
  const severity = input.severity || "info";
  const details = input.details || {};

  const checksum = calculateAuditChecksum(
    id,
    nowMs,
    input.actor.userId,
    input.action,
    input.resourceId
  );

  return {
    id,
    timestamp: nowMs,
    actor: input.actor,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    severity,
    details,
    checksum,
  };
}

/** Prüft die Integrität (Prüfsumme) eines Audit-Eintrags. */
export function verifyAuditChecksum(entry: AuditLogEntry): boolean {
  const expectedChecksum = calculateAuditChecksum(
    entry.id,
    entry.timestamp,
    entry.actor.userId,
    entry.action,
    entry.resourceId
  );
  return entry.checksum === expectedChecksum;
}

/** Maskiert personenbezogene Daten (PII) im Audit-Eintrag (z. B. E-Mails, IPs). */
export function maskPII(entry: AuditLogEntry): AuditLogEntry {
  const maskEmail = (email: string): string => {
    const parts = email.split("@");
    if (parts.length !== 2) return email;
    const name = parts[0];
    if (name.length <= 2) return `*@${parts[1]}`;
    return `${name[0]}***${name[name.length - 1]}@${parts[1]}`;
  };

  const maskIp = (ip?: string): string => {
    if (!ip) return "0.0.0.0";
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.x.x`;
    }
    return "masked-ip";
  };

  return {
    ...entry,
    actor: {
      ...entry.actor,
      email: maskEmail(entry.actor.email),
      ipAddress: entry.actor.ipAddress ? maskIp(entry.actor.ipAddress) : undefined,
    },
  };
}

/** Filtert Audit-Logs nach Kriterien wie Akteur, Zeitraum, Aktion oder Suchbegriff. */
export function filterAuditLogs(
  logs: AuditLogEntry[],
  query: AuditSearchQuery = {}
): AuditLogEntry[] {
  return logs.filter((log) => {
    if (query.actorUserId && log.actor.userId !== query.actorUserId) return false;
    if (query.actionType && query.actionType !== "all" && log.action !== query.actionType) return false;
    if (query.severity && query.severity !== "all" && log.severity !== query.severity) return false;
    if (query.resourceType && log.resourceType !== query.resourceType) return false;
    if (query.resourceId && log.resourceId !== query.resourceId) return false;

    if (query.fromDateMs && log.timestamp < query.fromDateMs) return false;
    if (query.toDateMs && log.timestamp > query.toDateMs) return false;

    if (query.searchTerm && query.searchTerm.trim().length > 0) {
      const term = query.searchTerm.trim().toLowerCase();
      const match =
        log.id.toLowerCase().includes(term) ||
        log.actor.email.toLowerCase().includes(term) ||
        log.actor.userId.toLowerCase().includes(term) ||
        log.resourceId.toLowerCase().includes(term) ||
        log.action.toLowerCase().includes(term) ||
        JSON.stringify(log.details).toLowerCase().includes(term);
      if (!match) return false;
    }

    return true;
  });
}

/** Exportiert eine Liste von Audit-Logs in JSON oder CSV. */
export function exportAuditLogs(logs: AuditLogEntry[], format: "json" | "csv"): string {
  if (format === "json") {
    return JSON.stringify(logs, null, 2);
  }

  // CSV Format
  const headers = ["ID", "Timestamp", "Actor_User", "Actor_Email", "Action", "Resource_Type", "Resource_ID", "Severity", "Checksum"];
  const rows = logs.map((l) => [
    l.id,
    new Date(l.timestamp).toISOString(),
    l.actor.userId,
    l.actor.email,
    l.action,
    l.resourceType,
    l.resourceId,
    l.severity,
    l.checksum,
  ]);

  const csvLines = [headers.join(","), ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))];
  return csvLines.join("\n");
}
