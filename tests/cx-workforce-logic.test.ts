import { describe, expect, it } from "vitest";
import { triageCxRequest } from "@/lib/cx-workforce-logic";

describe("CX workforce triage", () => {
  it("routes security incidents to critical human review", () => {
    const result = triageCxRequest({ message: "Mein Konto wurde gehackt, bitte helfen." });
    expect(result.category).toBe("security");
    expect(result.priority).toBe("critical");
    expect(result.queue).toBe("security");
    expect(result.humanReviewRequired).toBe(true);
    expect(result.automationMode).toBe("draft_only");
  });

  it("routes refunds to billing with human review and no refund promise", () => {
    const result = triageCxRequest({ message: "Ich möchte eine Rückerstattung, bitte Geld zurück." });
    expect(result.category).toBe("refund");
    expect(result.queue).toBe("billing-specialist");
    expect(result.humanReviewRequired).toBe(true);
    expect(result.responseDraft).toContain("noch nicht zugesagt");
  });

  it("classifies technical failures and requests safe diagnostic details", () => {
    const result = triageCxRequest({ message: "Die App stürzt ab und funktioniert nicht." });
    expect(result.category).toBe("technical");
    expect(result.queue).toBe("technical-support");
    expect(result.responseDraft).toContain("keine Zugangsdaten");
  });

  it("falls back to general support with conservative confidence", () => {
    const result = triageCxRequest({ message: "Hallo, ich habe eine Frage." });
    expect(result.category).toBe("general");
    expect(result.confidence).toBeLessThan(0.6);
    expect(result.humanReviewRequired).toBe(true);
  });

  it("rejects empty and oversized messages", () => {
    expect(() => triageCxRequest({ message: " " })).toThrow();
    expect(() => triageCxRequest({ message: "x".repeat(12001) })).toThrow();
  });
});

describe("CX external reference privacy guard", () => {
  it("accepts opaque provider identifiers and normalizes whitespace", async () => {
    const { normalizeCxExternalReference } = await import("@/server/cx-workforce-store");
    expect(normalizeCxExternalReference("  thread_123-ABC  ")).toBe("thread_123-ABC");
    expect(normalizeCxExternalReference("   ")).toBeNull();
  });

  it("rejects email addresses and free-form references before database access", async () => {
    const { normalizeCxExternalReference } = await import("@/server/cx-workforce-store");
    expect(() => normalizeCxExternalReference("customer@example.com")).toThrow(/opake ID/);
    expect(() => normalizeCxExternalReference("thread id with spaces")).toThrow(/opake ID/);
    expect(() => normalizeCxExternalReference("x".repeat(129))).toThrow(/opake ID/);
  });
});

describe("persisted CX record validation", () => {
  it("accepts a valid minimized case record", async () => {
    const { parseCxCaseRecord } = await import("@/server/cx-workforce-store");
    const triage = triageCxRequest({ message: "Hallo, ich habe eine Frage." });
    const record = {
      id: "a".repeat(32),
      source: "hubspot",
      externalReference: "thread_123",
      status: "needs_review",
      triage,
      createdAt: "2026-11-21T00:00:00.000Z",
    };
    expect(parseCxCaseRecord(record, record.id)).toEqual(record);
  });

  it("rejects malformed triage payloads, unexpected fields and mismatched IDs", async () => {
    const { parseCxCaseRecord } = await import("@/server/cx-workforce-store");
    const triage = triageCxRequest({ message: "Hallo, ich habe eine Frage." });
    const record = {
      id: "b".repeat(32),
      source: "hubspot",
      externalReference: "thread_123",
      status: "needs_review",
      triage,
      createdAt: "2026-11-21T00:00:00.000Z",
    };
    expect(() => parseCxCaseRecord({ ...record, triage: { ...triage, category: "unknown" } })).toThrow(/Ungültiger gespeicherter CX-Fall/);
    expect(() => parseCxCaseRecord({ ...record, rawMessage: "PII must not be accepted" })).toThrow(/Ungültiger gespeicherter CX-Fall/);
    expect(() => parseCxCaseRecord(record, "c".repeat(32))).toThrow(/Datenbankschlüssel/);
  });

  it("rejects a status that bypasses mandatory human review", async () => {
    const { parseCxCaseRecord } = await import("@/server/cx-workforce-store");
    const triage = triageCxRequest({ message: "Hallo, ich habe eine Frage." });
    expect(() => parseCxCaseRecord({
      id: "d".repeat(32),
      source: "admin_preview",
      externalReference: null,
      status: "draft_ready",
      triage,
      createdAt: "2026-11-21T00:00:00.000Z",
    })).toThrow(/Ungültiger gespeicherter CX-Fall/);
  });
});
