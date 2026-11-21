import { describe, expect, it } from "vitest";
import { buildGxpCxCaseAuditPayload } from "@/lib/gxp-cx-link";

describe("GxP to CX audit linkage", () => {
  it("emits only an opaque case reference and allow-listed triage metadata", () => {
    const payload = buildGxpCxCaseAuditPayload({
      caseId: "a".repeat(32),
      category: "security",
      priority: "critical",
      requiredControls: ["authenticated_actor", "human_quality_review"],
    });
    expect(payload).toEqual({
      requiredControls: ["authenticated_actor", "human_quality_review"],
      allowedToExecute: false,
      automationMode: "assessment_only",
      humanApprovalRequired: true,
      relatedRecordType: "cx_case",
      relatedRecordId: "a".repeat(32),
      cxTriageCategory: "security",
      cxPriority: "critical",
    });
    expect(JSON.stringify(payload)).not.toMatch(/message|subject|email|responseDraft|escalationReasons/i);
  });

  it("rejects malformed case IDs and unknown persisted triage values", () => {
    expect(() => buildGxpCxCaseAuditPayload({
      caseId: "customer@example.com", category: "security", priority: "critical", requiredControls: [],
    })).toThrow(/opake interne Fall-ID/);
    expect(() => buildGxpCxCaseAuditPayload({
      caseId: "a".repeat(32), category: "customer@example.com", priority: "critical", requiredControls: [],
    })).toThrow(/Ungültige CX-Kategorie/);
    expect(() => buildGxpCxCaseAuditPayload({
      caseId: "a".repeat(32), category: "security", priority: "customer@example.com", requiredControls: [],
    })).toThrow(/Ungültige CX-Priorität/);
  });
});
