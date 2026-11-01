/**
 * Sprint 22 - Stripe-Produktvarianten mit steuerlicher/zeitlicher Gueltigkeit.
 *
 * Reine Logik, keine Seiteneffekte. Stripe-Preise sind unveraenderlich: eine
 * Preisaenderung entsteht als neue Variante, die alte wird inaktiv gesetzt.
 * Daraus folgt die einzige belastbare Zeitaussage, die wir treffen koennen:
 * der Erstellzeitpunkt (created) ordnet Varianten. Gibt es keinen Zeitstempel,
 * wird das als fehlende Belegbarkeit ausgewiesen statt geschaetzt.
 *
 * Steuerliche Gueltigkeit: tax_behavior gilt je Preis, nicht je Produkt.
 * Weicht eine aktive Variante von der Standardvariante ab, ist das ein
 * steuerliches Risiko und wird benannt, nicht stillschweigend vereinheitlicht.
 */

export type VariantBilling = "one_time" | "recurring";
export type VariantTaxBehavior = "exclusive" | "inclusive" | "unspecified";

export interface CatalogVariant {
  id: string;
  currency: string;
  amountMinor: number | null;
  billing: VariantBilling;
  interval: string | null;
  intervalCount: number | null;
  taxBehavior: VariantTaxBehavior;
  active: boolean;
  /** Erstellzeitpunkt in Millisekunden; `null` bedeutet: in der Quelle nicht belegt. */
  createdAtMs: number | null;
  /** Vom Produkt referenzierter Standardpreis? */
  isDefault?: boolean;
}

export interface VariantSlot {
  currency: string;
  billing: VariantBilling;
  interval: string | null;
  intervalCount: number | null;
}

export interface VariantComparison {
  issues: string[];
  activeVariants: number;
  inactiveVariants: number;
  ambiguousSlots: VariantSlot[];
  supersededActivePriceIds: string[];
  taxBehaviorMix: VariantTaxBehavior[];
  defaultTaxMismatchPriceIds: string[];
  undatedPriceIds: string[];
  timeOrderKnown: boolean;
}

export function variantSlot(variant: CatalogVariant): VariantSlot {
  return {
    currency: variant.currency,
    billing: variant.billing,
    interval: variant.billing === "recurring" ? variant.interval : null,
    intervalCount: variant.billing === "recurring" ? variant.intervalCount : null,
  };
}

export function slotKey(slot: VariantSlot): string {
  return `${slot.currency}|${slot.billing}|${slot.interval ?? "-"}|${slot.intervalCount ?? "-"}`;
}

const SLOT_LABEL: Record<string, string> = {
  day: "täglich",
  week: "wöchentlich",
  month: "monatlich",
  year: "jährlich",
};

function describeSlot(slot: VariantSlot): string {
  if (slot.billing === "one_time") return `${slot.currency.toUpperCase()} einmalig`;
  const unit = SLOT_LABEL[slot.interval ?? ""] ?? slot.interval ?? "unbekannt";
  const count = slot.intervalCount && slot.intervalCount > 1 ? `alle ${slot.intervalCount} ` : "";
  return `${slot.currency.toUpperCase()} ${count}${unit}`;
}

/**
 * Vergleicht die Preisvarianten eines Produkts auf Preiskollisionen,
 * ueberholte aber weiterhin aktive Varianten, fehlende Zeitbelege und
 * uneinheitliche Steuerbehandlung.
 */
export function compareProductVariants(variants: readonly CatalogVariant[]): VariantComparison {
  const active = variants.filter(variant => variant.active);
  const issues: string[] = [];
  const bySlot = new Map<string, CatalogVariant[]>();

  for (const variant of active) {
    const key = slotKey(variantSlot(variant));
    bySlot.set(key, [...(bySlot.get(key) ?? []), variant]);
  }

  const ambiguousSlots: VariantSlot[] = [];
  const supersededActivePriceIds: string[] = [];
  for (const group of bySlot.values()) {
    if (group.length < 2) continue;
    const slot = variantSlot(group[0]!);
    ambiguousSlots.push(slot);
    issues.push(`Mehrere aktive Preise fuer ${describeSlot(slot)}: Preiskollision klaeren`);

    const dated = group.filter(variant => variant.createdAtMs !== null);
    if (dated.length === group.length) {
      const newest = dated.reduce((a, b) => (b.createdAtMs! > a.createdAtMs! ? b : a));
      for (const variant of dated) {
        if (variant.id !== newest.id) {
          supersededActivePriceIds.push(variant.id);
        }
      }
      if (supersededActivePriceIds.length > 0) {
        issues.push(
          `Aeltere Preisvariante(n) weiterhin aktiv und damit verkaufbar: ${supersededActivePriceIds.join(", ")}`,
        );
      }
    }
  }

  const undatedPriceIds = active.filter(variant => variant.createdAtMs === null).map(variant => variant.id);
  if (undatedPriceIds.length > 0) {
    issues.push(`Erstellzeitpunkt fehlt; zeitliche Gueltigkeit nicht belegbar: ${undatedPriceIds.join(", ")}`);
  }

  const taxBehaviorMix = [...new Set(active.map(variant => variant.taxBehavior))].sort();
  if (taxBehaviorMix.length > 1) {
    issues.push(`Steuerbehandlung zwischen aktiven Varianten uneinheitlich: ${taxBehaviorMix.join(" / ")}`);
  }

  const defaultVariant = variants.find(variant => variant.isDefault && variant.active);
  const defaultTaxMismatchPriceIds =
    defaultVariant === undefined
      ? []
      : active
          .filter(variant => variant.id !== defaultVariant.id && variant.taxBehavior !== defaultVariant.taxBehavior)
          .map(variant => variant.id);
  if (defaultVariant && defaultTaxMismatchPriceIds.length > 0) {
    issues.push(
      `Standardpreis ${defaultVariant.id} und Variante(n) ${defaultTaxMismatchPriceIds.join(", ")} ` +
        `sind steuerlich unterschiedlich behandelt`,
    );
  }

  if (active.length === 0) {
    issues.push("Keine aktive Preisvariante");
  }

  return {
    issues,
    activeVariants: active.length,
    inactiveVariants: variants.length - active.length,
    ambiguousSlots,
    supersededActivePriceIds,
    taxBehaviorMix: taxBehaviorMix as VariantTaxBehavior[],
    defaultTaxMismatchPriceIds,
    undatedPriceIds,
    timeOrderKnown: active.length > 0 && undatedPriceIds.length === 0,
  };
}
