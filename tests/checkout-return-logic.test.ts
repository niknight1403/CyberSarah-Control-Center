import { describe, it, expect } from "vitest";
import {
  parseReturnParam,
  resolveCheckoutOutcome,
  primaryActionLabel,
} from "@/lib/checkout-return-logic";

describe("Sprint 316 — Checkout-Rueckweg", () => {
  it("parst bekannte Parameter, Unbekannt bleibt unbekannt", () => {
    expect(parseReturnParam("success")).toBe("success");
    expect(parseReturnParam(" CANCEL ")).toBe("cancel");
    expect(parseReturnParam("kaputt")).toBe("unknown");
    expect(parseReturnParam(null)).toBe("unknown");
  });

  it("Erfolg nur aus verifizierter Session, nie aus URL allein", () => {
    expect(resolveCheckoutOutcome("success", null).state).not.toBe("erfolg");
    expect(resolveCheckoutOutcome("success", "complete").state).toBe("erfolg");
    expect(resolveCheckoutOutcome("success", "complete").retry).toBe(false);
  });

  it("Abbruch ohne Session: ehrlich, nichts abgebucht", () => {
    const out = resolveCheckoutOutcome("cancel", null);
    expect(out.state).toBe("abgebrochen");
    if (out.state === "abgebrochen") expect(out.message).toContain("nichts abgebucht");
    expect(out.retry).toBe(true);
  });

  it("offene Session und abgelaufene Session bleiben getrennt", () => {
    expect(resolveCheckoutOutcome("pending", "open").state).toBe("offen");
    expect(resolveCheckoutOutcome("success", "expired").state).toBe("ungueltig");
    expect(resolveCheckoutOutcome("unknown", null).state).toBe("ungueltig");
  });

  it("Button-Label passt zum Zustand", () => {
    expect(primaryActionLabel(resolveCheckoutOutcome("success", "complete"))).toContain("Weiter");
    expect(primaryActionLabel(resolveCheckoutOutcome("cancel", null))).toContain("erneut");
  });
});
