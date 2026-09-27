/**
 * Sprint 268 — Level-3-Freigabe-Flow fuer externe Aktionen (rein, testbar).
 * Muster aus revenue-os-app: Draft -> Pruefung -> Freigabe -> Ausfuehrung,
 * mit Idempotenz und Audit-Spur.
 *
 * Ehrlichkeits-Regeln:
 *   - Extern heisst sichtbar nach draussen: E-Mail, Social-Post, Zahlung.
 *     Solche Aktionen brauchen die hoechste Freigabestufe (Level 3).
 *   - Eine abgelehnte Aktion bleibt abgelehnt — ein neuer Versuch ist ein
 *     neuer Draft, keine Rueckgaengigmachung der Ablehnung.
 *   - Die Audit-Spur ist unveraenderlich: jede Entscheidung bleibt lesbar.
 */

export const APPROVAL_LEVELS = { none: 0, review: 1, external: 3 } as const;
export type ExternalActionKind = "email_send" | "social_post_draft" | "payment_link" | "api_webhook";

export type ExternalActionDraft = {
  id: string;
  kind: ExternalActionKind;
  payloadPreview: string;
  createdAt: number;
  idempotencyKey: string;
};

export type ExternalActionRecord = ExternalActionDraft & {
  status: "pending_approval" | "approved" | "rejected" | "executed" | "failed";
  decidedAt: number | null;
  executedAt: number | null;
  outcome: string | null;
};

export type ApprovalDecision =
  | { decision: "approve" }
  | { decision: "reject"; reason: string }
  | { decision: "revoke" };

export function levelForKind(kind: ExternalActionKind): number {
  return APPROVAL_LEVELS.external;
}

export function validateExternalActionDraft(draft: Partial<ExternalActionDraft>): { valid: true } | { valid: false; reason: string } {
  if (!draft.id?.trim()) return { valid: false, reason: "Draft braucht eine ID." };
  if (!["email_send", "social_post_draft", "payment_link", "api_webhook"].includes(draft.kind ?? "")) {
    return { valid: false, reason: "Unbekannte Aktion — keine freien Kinds." };
  }
  const preview = draft.payloadPreview?.trim() ?? "";
  if (preview.length < 5 || preview.length > 2000) return { valid: false, reason: "Payload-Vorschau braucht 5–2000 Zeichen — Unklarheit wird nicht freigegeben." };
  if (!draft.idempotencyKey?.trim()) return { valid: false, reason: "Ohne Idempotenz-Schluessel keine externe Aktion." };
  return { valid: true };
}

const ALLOWED_TRANSITIONS: Record<ExternalActionRecord["status"], ReadonlySet<ExternalActionRecord["status"]>> = {
  pending_approval: new Set(["approved", "rejected"]),
  approved: new Set(["executed", "failed"]),
  rejected: new Set([]),
  executed: new Set([]),
  failed: new Set([]),
};

export function applyApprovalDecision(record: ExternalActionRecord, decision: ApprovalDecision, now = Date.now): ExternalActionRecord {
  if (decision.decision === "approve") {
    if (!ALLOWED_TRANSITIONS[record.status].has("approved")) {
      return { ...record, status: record.status, outcome: `Freigabe unzulaessig im Zustand ${record.status} — Audit-Spur unveraenderbar.` };
    }
    return { ...record, status: "approved", decidedAt: now() };
  }
  if (decision.decision === "reject") {
    if (!ALLOWED_TRANSITIONS[record.status].has("rejected")) {
      return { ...record, status: record.status, outcome: `Ablehnung unzulaessig im Zustand ${record.status}.` };
    }
    return { ...record, status: "rejected", decidedAt: now(), outcome: decision.reason };
  }
  if (record.status === "approved") {
    return { ...record, status: "rejected", decidedAt: now(), outcome: "Freigabe zurueckgezogen vor der Ausfuehrung." };
  }
  return { ...record, outcome: "Zurueckziehen unmoeglich — die Aktion lief bereits oder wurde abgelehnt." };
}

export function markExecution(record: ExternalActionRecord, outcome: string, ok: boolean, now = Date.now): ExternalActionRecord {
  if (record.status !== "approved") {
    return { ...record, outcome: `Ausfuehrung verweigert im Zustand ${record.status} — nur freigegebene Aktionen gehen raus.` };
  }
  return { ...record, status: ok ? "executed" : "failed", executedAt: now(), outcome };
}

export function auditLine(record: ExternalActionRecord): string {
  const decision = record.decidedAt ? new Date(record.decidedAt).toISOString() : "offen";
  return `[${record.kind}] ${record.id}: ${record.status} (Freigabe: ${decision}, Idem: ${record.idempotencyKey})${record.outcome ? ` — ${record.outcome}` : ""}`;
}
