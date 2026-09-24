import { describe, it, expect } from "vitest";
import {
  sortInvoicesDesc,
  sumPaid,
  sumOutstanding,
  sumUncollectible,
  formatAmount,
  formatInvoiceLine,
  emptyHistoryMessage,
} from "@/lib/billing-history-logic";
import type { InvoiceLike } from "@/lib/billing-history-logic";

const inv = (over: Partial<InvoiceLike> = {}): InvoiceLike => ({
  id: "i1",
  number: "RE-2026-001",
  date: 1000,
  amountCents: 1234,
  currency: "eur",
  status: "paid",
  ...over,
});

describe("Sprint 317 — Rechnungshistorie", () => {
  it("sortiert neueste zuerst", () => {
    const sorted = sortInvoicesDesc([inv({ id: "old", date: 100 }), inv({ id: "new", date: 200 })]);
    expect(sorted.map((i) => i.id)).toEqual(["new", "old"]);
  });

  it("Summen trennen bezahlt/offen/uneinziehbar ehrlich", () => {
    const list = [
      inv({ amountCents: 1000, status: "paid" }),
      inv({ amountCents: 500, status: "open" }),
      inv({ amountCents: 250, status: "uncollectible" }),
      inv({ amountCents: 999, status: "void" }),
    ];
    expect(sumPaid(list)).toBe(1000);
    expect(sumOutstanding(list)).toBe(500);
    expect(sumUncollectible(list)).toBe(250);
  });

  it("formatiert Cent-Betraege deutsch: 12,34 EUR", () => {
    expect(formatAmount(1234, "eur")).toBe("12,34 EUR");
    expect(formatAmount(0, "eur")).toBe("0,00 EUR");
  });

  it("Rechnungszeile enthaelt Nummer, Betrag und Status", () => {
    expect(formatInvoiceLine(inv({ status: "open" }))).toContain("offen");
    expect(formatInvoiceLine(inv())).toContain("RE-2026-001");
    expect(formatInvoiceLine(inv())).toContain("12,34 EUR");
  });

  it("leere Historie: ehrliche Meldung statt Nullsumme", () => {
    expect(emptyHistoryMessage([])).toContain("keine Rechnungen");
    expect(emptyHistoryMessage([inv()])).toBeNull();
  });
});
