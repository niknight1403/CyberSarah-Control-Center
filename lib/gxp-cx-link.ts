import type { CxCategory, CxPriority } from "./cx-workforce-logic";

const CX_CATEGORIES: readonly CxCategory[] = [
  "billing", "refund", "technical", "account", "product", "security", "complaint", "general",
];
const CX_PRIORITIES: readonly CxPriority[] = ["critical", "high", "normal", "low"];

export function buildGxpCxCaseAuditPayload(input: {
  caseId: unknown;
  category: unknown;
  priority: unknown;
  requiredControls: string[];
}) {
  if (typeof input.caseId !== "string" || !/^[a-f0-9]{32}$/.test(input.caseId)) {
    throw new Error("GxP-CX-Verknüpfung benötigt eine opake interne Fall-ID.");
  }
  if (typeof input.category !== "string" || !CX_CATEGORIES.includes(input.category as CxCategory)) {
    throw new Error("Ungültige CX-Kategorie; Audit-Verknüpfung wurde abgebrochen.");
  }
  if (typeof input.priority !== "string" || !CX_PRIORITIES.includes(input.priority as CxPriority)) {
    throw new Error("Ungültige CX-Priorität; Audit-Verknüpfung wurde abgebrochen.");
  }

  // Explicit allow-list: never spread persisted case data into a regulated audit event.
  return {
    requiredControls: [...input.requiredControls],
    allowedToExecute: false as const,
    automationMode: "assessment_only" as const,
    humanApprovalRequired: true as const,
    relatedRecordType: "cx_case" as const,
    relatedRecordId: input.caseId,
    cxTriageCategory: input.category as CxCategory,
    cxPriority: input.priority as CxPriority,
  };
}
