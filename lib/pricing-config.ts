/**
 * Kanonische Preis- und Token-Wahrheit (Sprint: Unified Credit Ledger).
 *
 * Ein Paket, drei Kanäle (Stripe, Google Play, Anzeige) — aber genau eine Zahl
 * für Tokens und Preis. Vorher lagen die Tokens in `CREDIT_PACKS`, die
 * Stripe-Preise in `STRIPE_PRICE_ID_*` und die Play-Kennungen nirgends
 * zentral; damit konnte ein Kanal eine andere Menge gutschreiben als der
 * andere.
 *
 * Regeln:
 *  - Preis und Token-Menge stehen hier, nicht im Aufrufer.
 *  - Play-Kennungen: kanonisch `credit_pack_*`, dazu die alten `credits_*` als
 *    Alias, damit bereits ausgelieferte Play-Produkte weiter funktionieren.
 *  - Fehlt eine Stripe-Preis-ID in der Umgebung, ist das Paket über Stripe
 *    nicht kaufbar (`stripePriceId: null`) — es wird nichts erfunden.
 */

export type CreditPackId = "credit_pack_small" | "credit_pack_medium" | "credit_pack_large";

export interface CreditPackDefinition {
  id: CreditPackId;
  /** Alte Kennung (Play/Anzeige), bleibt gültig. */
  legacyId: string;
  label: string;
  tokens: number;
  priceEur: number;
  /** Umgebungsvariable der Stripe-Preis-ID. */
  stripePriceEnv: string;
  /** Google-Play-Produktkennungen, die auf dieses Paket zeigen. */
  playProductIds: readonly string[];
}

export const CREDIT_PACKS_CANONICAL: readonly CreditPackDefinition[] = [
  {
    id: "credit_pack_small",
    legacyId: "credits_small",
    label: "50.000 Cloud-Tokens",
    tokens: 50_000,
    priceEur: 4.99,
    stripePriceEnv: "STRIPE_PRICE_SMALL",
    playProductIds: ["credit_pack_small", "credits_small"],
  },
  {
    id: "credit_pack_medium",
    legacyId: "credits_medium",
    label: "250.000 Cloud-Tokens",
    tokens: 250_000,
    priceEur: 19.99,
    stripePriceEnv: "STRIPE_PRICE_MEDIUM",
    playProductIds: ["credit_pack_medium", "credits_medium"],
  },
  {
    id: "credit_pack_large",
    legacyId: "credits_large",
    label: "1.000.000 Cloud-Tokens",
    tokens: 1_000_000,
    priceEur: 59.99,
    stripePriceEnv: "STRIPE_PRICE_LARGE",
    playProductIds: ["credit_pack_large", "credits_large"],
  },
];

/** Stripe-Preis-ID aus der Umgebung (leer/fehlend → null). */
export function stripePriceIdFor(pack: CreditPackDefinition): string | null {
  const value = (process.env[pack.stripePriceEnv] ?? "").trim();
  return value.startsWith("price_") ? value : null;
}

/** Paket über eine beliebige Kennung finden (kanonisch, alt, Play, Stripe). */
export function findCreditPack(identifier: string, priceId?: string): CreditPackDefinition | null {
  const clean = (identifier ?? "").trim().toLowerCase();
  if (clean) {
    const byId = CREDIT_PACKS_CANONICAL.find(
      (pack) => pack.id === clean || pack.legacyId === clean || pack.playProductIds.includes(clean),
    );
    if (byId) return byId;
  }
  if (priceId) {
    const byPrice = CREDIT_PACKS_CANONICAL.find((pack) => stripePriceIdFor(pack) === priceId.trim());
    if (byPrice) return byPrice;
  }
  return null;
}

/** Paket über eine Stripe-Preis-ID (für den Webhook, wenn Metadaten fehlen). */
export function findCreditPackByPriceId(priceId: string | null | undefined): CreditPackDefinition | null {
  const clean = (priceId ?? "").trim();
  if (!clean) return null;
  return CREDIT_PACKS_CANONICAL.find((pack) => stripePriceIdFor(pack) === clean) ?? null;
}

/** Nur die Pakete, die über Stripe wirklich kaufbar sind. */
export function stripeSellablePacks(): Array<CreditPackDefinition & { stripePriceId: string }> {
  return CREDIT_PACKS_CANONICAL.flatMap((pack) => {
    const priceId = stripePriceIdFor(pack);
    return priceId ? [{ ...pack, stripePriceId: priceId }] : [];
  });
}

/** Anzeige-/API-Sicht für alle Pakete. */
export function creditPackCatalog(): Array<{
  id: string;
  legacyId: string;
  label: string;
  tokens: number;
  priceEur: number;
  playProductIds: string[];
  stripeAvailable: boolean;
}> {
  return CREDIT_PACKS_CANONICAL.map((pack) => ({
    id: pack.id,
    legacyId: pack.legacyId,
    label: pack.label,
    tokens: pack.tokens,
    priceEur: pack.priceEur,
    playProductIds: [...pack.playProductIds],
    stripeAvailable: stripePriceIdFor(pack) !== null,
  }));
}
