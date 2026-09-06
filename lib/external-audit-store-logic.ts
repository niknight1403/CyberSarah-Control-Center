import {
  exportAuditLog,
  rotateAuditLog,
  type AuditEntry,
  type AuditExport,
  type RotationConfig,
  type RotationResult,
} from "./audit-rotation-logic";
import {
  externalActionAuditService,
  type AuditEvent,
  type AuditTransport,
} from "./external-action-audit-service";

export type ExternalAuditStore = {
  entries: AuditEntry[];
  rotationConfig: RotationConfig;
};

/**
 * Ordnet ein externes Audit-Ereignis dem Eintragsformat der geprüften
 * Sprint-37-Rotation zu. Die Metadaten sind bereits durch den Audit-Service
 * sanitisiert; hier fließen ausschließlich gerüstete Felder ein.
 */
export function auditEntryFromEvent(event: AuditEvent): AuditEntry {
  const metadata: Record<string, string | number | boolean | null> = {
    action: event.action,
    status: event.status,
    ...event.metadata,
  };
  if (event.repository) metadata.repository = event.repository;
  if (event.branch) metadata.branch = event.branch;
  if (event.commitSha) metadata.commitSha = event.commitSha;
  if (event.runId) metadata.runId = event.runId;
  if (event.message) metadata.message = event.message;
  return {
    id: event.eventId,
    actor: "external-action",
    action: event.action,
    targetPath: null,
    timestampMs: Date.parse(event.occurredAt),
    metadata,
  };
}

/**
 * Erstellt den rotierenden Audit-Store für externe Aktionen. Die
 * Rotationsparameter werden erst bei der ersten Aufzeichnung geprüft —
 * dieselben Regeln wie in Sprint 37.
 */
export function createRotatingAuditStore(rotationConfig: RotationConfig): ExternalAuditStore {
  if (!rotationConfig || typeof rotationConfig !== "object") {
    throw new Error("Die Rotationskonfiguration muss ein Objekt sein.");
  }
  return { entries: [], rotationConfig };
}

export type AuditRecordOutcome = {
  event: AuditEvent;
  entry: AuditEntry;
  rotation: RotationResult;
  store: ExternalAuditStore;
};

/**
 * Zeichnet ein externes Audit-Ereignis auf und rotiert das Log unmittelbar
 * über die geprüfte Sprint-37-Logik. Der optionale Transport wird vom
 * Audit-Service selbst aufgerufen.
 */
export async function recordAuditEvent(
  store: ExternalAuditStore,
  input: Parameters<typeof externalActionAuditService.record>[0],
  transport?: AuditTransport,
): Promise<AuditRecordOutcome> {
  const event = await externalActionAuditService.record(input, transport);
  const entry = auditEntryFromEvent(event);
  store.entries.push(entry);
  const rotation = rotateAuditLog(store.entries, store.rotationConfig);
  store.entries = rotation.kept;
  return { event, entry, rotation, store };
}

/**
 * Exportiert das rotierende Log ohne sensible Werte und zählt die
 * Redaktionen nachvollziehbar — unverändert die geprüfte Sprint-37-Logik.
 */
export function exportStoreAudit(store: ExternalAuditStore, nowMs: number): AuditExport {
  return exportAuditLog(store.entries, nowMs);
}
