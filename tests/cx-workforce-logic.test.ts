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
