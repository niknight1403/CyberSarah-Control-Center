import { describe, expect, it } from "vitest";

import { evaluateEmailSend, isValidEmail, validateEmailDispatch, type EmailDispatchInput } from "../lib/email-logic";

const valid: EmailDispatchInput = {
  kind: "receipt",
  to: "kunde@example.de",
  subject: "Deine Quittung von CyberSarah",
  body: "Danke für deinen Plan — hier ist die Quittung für diesen Monat.",
  optIn: { documented: true, source: "Signup-Formular 2026-09-01" },
  idempotencyKey: "receipt-2026-09-24-user1",
};

describe("email dispatch logic (Sprint 266)", () => {
  it("laesst valide Dispatches zu mit Idempotenz-Nachricht", () => {
    const result = evaluateEmailSend(valid, new Set());
    expect(result.outcome.status).toBe("sent");
    if (result.outcome.status === "sent") expect(result.outcome.messageId).toContain("receipt-2026-09-");
  });

  it("Duplikate werden benannt, nicht doppelt versendet", () => {
    const result = evaluateEmailSend(valid, new Set([valid.idempotencyKey]));
    expect(result.outcome.status).toBe("duplicate");
  });

  it("ohne dokumentiertes Opt-in kein Versand, keine Ausnahme", () => {
    const result = evaluateEmailSend({ ...valid, optIn: { documented: false, source: "erraten" } }, new Set());
    expect(result.outcome.status).toBe("rejected");
    if (result.outcome.status === "rejected") expect(result.outcome.reason).toContain("Opt-in");
  });

  it("Opt-in ohne Quelle ist nicht nachvollziehbar", () => {
    const result = evaluateEmailSend({ ...valid, optIn: { documented: true, source: "  " } }, new Set());
    expect(result.outcome.status).toBe("rejected");
  });

  it("ungueltige Adressen und Grenzen werden abgelehnt", () => {
    expect(isValidEmail("kein-at.de")).toBe(false);
    expect(evaluateEmailSend({ ...valid, to: "kein-at.de" }, new Set()).outcome.status).toBe("rejected");
    expect(evaluateEmailSend({ ...valid, subject: "kurz" }, new Set()).outcome.status).toBe("rejected");
    expect(evaluateEmailSend({ ...valid, idempotencyKey: "" }, new Set()).outcome.status).toBe("rejected");
    expect(validateEmailDispatch(valid).valid).toBe(true);
  });
});
