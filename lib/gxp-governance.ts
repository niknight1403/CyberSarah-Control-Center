export type GxpFramework = "GMP" | "GDP" | "GLP" | "GCP" | "GxP_GENERIC";
export type GxpActivity = "document_change" | "quality_event" | "deviation" | "capa" | "training" | "release" | "support_escalation";
export type GxpGateStatus = "blocked" | "human_review_required" | "ready_for_human_approval";

export interface GxpGateInput {
  framework: GxpFramework;
  activity: GxpActivity;
  actorId: string;
  sopReference?: string;
  changeControlReference?: string;
  evidenceReferences?: string[];
  riskLevel?: "low" | "medium" | "high" | "critical";
}

export interface GxpGateResult {
  framework: GxpFramework;
  activity: GxpActivity;
  status: GxpGateStatus;
  allowedToExecute: false;
  automationMode: "assessment_only";
  requiredControls: string[];
  missingControls: string[];
  humanApprovalRequired: true;
  distinctApproverCount: number;
}

const HIGH_RISK_ACTIVITIES: GxpActivity[] = ["document_change", "quality_event", "deviation", "capa", "release"];
const BASE_CONTROLS = ["authenticated_actor", "controlled_sop_reference", "traceable_evidence", "human_quality_review"];
const CHANGE_CONTROL_ACTIVITIES: GxpActivity[] = ["document_change", "release"];
const OPAQUE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

function validateOpaqueReference(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || !OPAQUE_REFERENCE_PATTERN.test(normalized)) {
    throw new Error(`${label} must be an opaque identifier, not free-form or personal data.`);
  }
  return normalized;
}

export function evaluateGxpGate(input: GxpGateInput): GxpGateResult {
  const actorId = String(input.actorId ?? "").trim();
  if (!actorId || actorId.length > 128) throw new Error("A valid actorId is required.");
  const sopReference = validateOpaqueReference(input.sopReference, "SOP reference");
  const changeControlReference = validateOpaqueReference(input.changeControlReference, "Change-control reference");
  const evidence = (input.evidenceReferences ?? []).map((item) => String(item).trim()).filter(Boolean);
  if (evidence.some((item) => item.length > 128 || !OPAQUE_REFERENCE_PATTERN.test(item))) {
    throw new Error("Evidence references must be opaque identifiers, not free-form or personal data.");
  }
  const requiredControls = [...BASE_CONTROLS];
  if (CHANGE_CONTROL_ACTIVITIES.includes(input.activity)) requiredControls.push("approved_change_control_reference");
  if (HIGH_RISK_ACTIVITIES.includes(input.activity) || input.riskLevel === "high" || input.riskLevel === "critical") {
    requiredControls.push("two_distinct_quality_approvers");
  }
  const missingControls: string[] = [];
  if (!sopReference) missingControls.push("controlled_sop_reference");
  if (!evidence.length) missingControls.push("traceable_evidence");
  if (CHANGE_CONTROL_ACTIVITIES.includes(input.activity) && !changeControlReference) {
    missingControls.push("approved_change_control_reference");
  }
  // No trusted approval registry/signature workflow exists yet. Never treat client-supplied IDs as approvals.
  if (requiredControls.includes("two_distinct_quality_approvers")) {
    missingControls.push("two_distinct_quality_approvers");
  }
  const status: GxpGateStatus = missingControls.length ? "blocked" : "human_review_required";
  return {
    framework: input.framework,
    activity: input.activity,
    status,
    allowedToExecute: false,
    automationMode: "assessment_only",
    requiredControls,
    missingControls: [...new Set(missingControls)],
    humanApprovalRequired: true,
    distinctApproverCount: 0,
  };
}
