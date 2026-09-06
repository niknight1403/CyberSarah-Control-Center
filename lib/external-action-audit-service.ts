export type AuditEvent = {
  eventId: string;
  action: "build" | "test" | "push" | "pull_request" | "ci" | "release";
  status: "started" | "passed" | "failed" | "cancelled";
  repository?: string;
  branch?: string;
  commitSha?: string;
  runId?: string;
  message?: string;
  metadata?: Record<string, string | number | boolean | null>;
  occurredAt: string;
};

const SECRET_KEY = /(token|secret|password|authorization|cookie|api[-_]?key)/i;

export function sanitizeAuditMetadata(metadata: Record<string, unknown> | undefined): Record<string, string | number | boolean | null> | undefined {
  if (!metadata) return undefined;
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, SECRET_KEY.test(key) ? "[REDACTED]" : typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null ? value : String(value).slice(0, 240)]));
}

export function createAuditEvent(input: Omit<AuditEvent, "occurredAt" | "metadata"> & { occurredAt?: string; metadata?: Record<string, unknown> }): AuditEvent {
  return {
    ...input,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    metadata: sanitizeAuditMetadata(input.metadata),
  };
}

export type AuditTransport = (event: AuditEvent) => Promise<void>;

import {
  createRotatingAuditStore,
  exportStoreAudit,
  recordAuditEvent,
  type AuditRecordOutcome,
  type ExternalAuditStore,
} from "./external-audit-store-logic";
import type { AuditEntry, AuditExport, RotationConfig } from "./audit-rotation-logic";

export const externalActionAuditService = {
  create: createAuditEvent,
  sanitize: sanitizeAuditMetadata,
  async record(input: Parameters<typeof createAuditEvent>[0], transport?: AuditTransport): Promise<AuditEvent> {
    const event = createAuditEvent(input);
    if (transport) await transport(event);
    return event;
  },
};

// Sprint 47: Rotation-Anbindung. Der Service nutzt die geprüfte
// Sprint-37-Rotation (lib/audit-rotation-logic.ts) über das Store-Modul;
// der Export bleibt tokenfrei und zählt Redaktionen nachvollziehbar.
export type RotatingAuditRecorder = {
  record: (
    input: Omit<AuditEvent, "occurredAt" | "metadata"> & {
      occurredAt?: string;
      metadata?: Record<string, unknown>;
    },
    transport?: AuditTransport,
  ) => Promise<AuditRecordOutcome>;
  export: (nowMs: number) => AuditExport;
  store: ExternalAuditStore;
};

export function withRotation(rotationConfig: RotationConfig): RotatingAuditRecorder {
  const store = createRotatingAuditStore(rotationConfig);
  return {
    store,
    record: (input, transport) => recordAuditEvent(store, input, transport),
    export: (nowMs) => exportStoreAudit(store, nowMs),
  };
}
