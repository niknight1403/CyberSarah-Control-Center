import { describe, expect, it } from "vitest";
import {
  compareProductVariants,
  slotKey,
  variantSlot,
  type CatalogVariant,
} from "../lib/stripe-variant-validity-logic";

const T = (iso: string) => Date.parse(iso);

const variant = (over: Partial<CatalogVariant> & { id: string }): CatalogVariant => ({
  currency: "eur",
  amountMinor: 1900,
  billing: "one_time",
  interval: null,
  intervalCount: null,
  taxBehavior: "inclusive",
  active: true,
  createdAtMs: T("2026-09-01T00:00:00Z"),
  ...over,
});

describe("Sprint 22 – Stripe-Varianten mit steuerlicher/zeitlicher Gueltigkeit", () => {
  it("meldet eine Preiskollision, wenn zwei aktive Preise denselben Slot belegen", () => {
    const result = compareProductVariants([
      variant({ id: "price_a", createdAtMs: T("2026-08-01T00:00:00Z") }),
      variant({ id: "price_b", createdAtMs: T("2026-09-01T00:00:00Z") }),
    ]);
    expect(result.ambiguousSlots).toEqual([
      { currency: "eur", billing: "one_time", interval: null, intervalCount: null },
    ]);
    expect(result.issues.some(v => v.includes("Mehrere aktive Preise fuer EUR einmalig"))).toBe(true);
  });

  it("benennt die aeltere Variante als weiterhin verkaufbar, wenn eine neuere existiert", () => {
    const result = compareProductVariants([
      variant({ id: "price_old", createdAtMs: T("2026-05-01T00:00:00Z") }),
      variant({ id: "price_new", createdAtMs: T("2026-09-15T00:00:00Z") }),
    ]);
    expect(result.supersededActivePriceIds).toEqual(["price_old"]);
    expect(result.timeOrderKnown).toBe(true);
    expect(result.issues.some(v => v.includes("weiterhin aktiv"))).toBe(true);
  });

  it("erfindet keine Zeitaussage, wenn Erstellzeitpunkte fehlen", () => {
    const result = compareProductVariants([
      variant({ id: "price_x", createdAtMs: null }),
      variant({ id: "price_y", createdAtMs: null }),
    ]);
    expect(result.timeOrderKnown).toBe(false);
    expect(result.supersededActivePriceIds).toEqual([]);
    expect(result.undatedPriceIds).toEqual(["price_x", "price_y"]);
    expect(result.issues.some(v => v.includes("nicht belegbar"))).toBe(true);
  });

  it("ignoriert inaktive Varianten bei Kollisionen, zaehlt sie aber getrennt", () => {
    const result = compareProductVariants([
      variant({ id: "price_live" }),
      variant({ id: "price_retired", active: false }),
    ]);
    expect(result.activeVariants).toBe(1);
    expect(result.inactiveVariants).toBe(1);
    expect(result.ambiguousSlots).toEqual([]);
    expect(result.supersededActivePriceIds).toEqual([]);
  });

  it("trennt Abo-Slots nach Intervall und Intervallanzahl", () => {
    const monthly = variant({
      id: "price_month",
      billing: "recurring",
      interval: "month",
      intervalCount: 1,
      currency: "eur",
    });
    const quarterly = variant({
      id: "price_quarter",
      billing: "recurring",
      interval: "month",
      intervalCount: 3,
      currency: "eur",
    });
    const result = compareProductVariants([monthly, quarterly]);
    expect(result.ambiguousSlots).toEqual([]);
    expect(slotKey(variantSlot(monthly))).not.toBe(slotKey(variantSlot(quarterly)));
  });

  it("erkennt gemischte Waehrungen als getrennte Slots statt als Kollision", () => {
    const result = compareProductVariants([
      variant({ id: "price_eur", currency: "eur" }),
      variant({ id: "price_usd", currency: "usd" }),
    ]);
    expect(result.ambiguousSlots).toEqual([]);
    expect(result.issues.some(v => v.includes("Preiskollision"))).toBe(false);
  });

  it("weist uneinheitliche Steuerbehandlung der aktiven Varianten aus", () => {
    const result = compareProductVariants([
      variant({ id: "price_incl", taxBehavior: "inclusive" }),
      variant({ id: "price_excl", taxBehavior: "exclusive", currency: "usd" }),
    ]);
    expect(result.taxBehaviorMix).toEqual(["exclusive", "inclusive"]);
    expect(result.issues.some(v => v.includes("Steuerbehandlung zwischen aktiven Varianten uneinheitlich"))).toBe(true);
  });

  it("vergleicht Varianten gegen die Steuerbehandlung des Standardpreises", () => {
    const result = compareProductVariants([
      variant({ id: "price_default", taxBehavior: "inclusive", isDefault: true }),
      variant({ id: "price_b", taxBehavior: "unspecified", currency: "usd" }),
    ]);
    expect(result.defaultTaxMismatchPriceIds).toEqual(["price_b"]);
    expect(result.issues.some(v => v.includes("steuerlich unterschiedlich behandelt"))).toBe(true);
  });

  it("meldet ein Produkt ohne aktive Variante, ohne Steuer-Mix zu erfinden", () => {
    const result = compareProductVariants([variant({ id: "price_off", active: false })]);
    expect(result.activeVariants).toBe(0);
    expect(result.issues).toContain("Keine aktive Preisvariante");
    expect(result.taxBehaviorMix).toEqual([]);
    expect(result.timeOrderKnown).toBe(false);
  });
});
