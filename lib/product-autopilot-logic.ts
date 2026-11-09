/**
 * CyberSarah Control Center — Produkt-Autopilot, reine Logik.
 *
 * Der Autopilot legt Digistore24-Produkte selbststaendig an. Alles, was dabei
 * schiefgehen kann, ohne echte API oder Datenbank zu brauchen, entscheidet
 * diese Datei: welche Idee dran ist, welche Parameter an Digistore24 gehen und
 * wie die Antwort gelesen wird. Der Netzwerk- und DB-Teil liegt in
 * server/product-autopilot.ts.
 *
 * Grundsaetze:
 *   - Keine Erfindung: eine Idee wird nur angelegt, wenn sie im Katalog steht,
 *     freigegeben ist und noch nicht existiert.
 *   - Idempotenz: der Slug ist der Schluessel. Existiert er lokal oder heisst
 *     ein Produkt bei Digistore24 schon so, wird nichts doppelt angelegt.
 *   - Ehrlichkeit: Digistore24 gibt Produkte erst nach manueller Freigabe frei.
 *     Ein angelegtes Produkt ist deshalb "awaiting_approval", nie "live".
 */

export const DIGISTORE24_PRODUCT_TYPE_SOFTWARE = 37;
export const MAX_PRODUCTS_PER_RUN = 3;
export const MAX_AUTOPILOT_PRODUCTS_TOTAL = 20;

export type ProductInterval = "1_month" | "3_month" | "6_month" | "12_month";

export type ProductIdea = {
  slug: string;
  name: string;
  priceCents: number;
  interval: ProductInterval;
  description: string;
  accessInstructions: string;
  /** Warum diese Idee wirtschaftlich begruendet ist (Wettbewerbsmatrix, Segment). */
  rationale: string;
  /** Bewusst gesetzt: nur freigegebene Ideen legt der Autopilot an. */
  approved: boolean;
};

export type PlannedProduct = {
  idea: ProductIdea;
  /** Fertige Parameter fuer createProduct (data[...]-Schluessel). */
  createParams: Record<string, string>;
  /** Fertige Parameter fuer createPaymentPlan. */
  planParams: Record<string, string>;
  intervalLabel: string;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_INTERVALS: ProductInterval[] = ["1_month", "3_month", "6_month", "12_month"];

/** Nimmt den Inhalt von config/product-ideas.json und behaelt nur brauchbare Ideen. */
export function parseProductIdeas(raw: unknown): ProductIdea[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const ideas: ProductIdea[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const slug = String(row.slug ?? "").trim().toLowerCase();
    const name = String(row.name ?? "").trim();
    const priceCents = Number(row.priceCents);
    const interval = String(row.interval ?? "").trim() as ProductInterval;
    if (!SLUG_PATTERN.test(slug) || seen.has(slug)) continue;
    if (!name || name.length > 120) continue;
    if (!Number.isInteger(priceCents) || priceCents <= 0 || priceCents > 10_000_00) continue;
    if (!ALLOWED_INTERVALS.includes(interval)) continue;
    seen.add(slug);
    ideas.push({
      slug,
      name,
      priceCents,
      interval,
      description: String(row.description ?? "").trim(),
      accessInstructions: String(row.accessInstructions ?? "").trim(),
      rationale: String(row.rationale ?? "").trim(),
      approved: row.approved === true,
    });
  }
  return ideas;
}

/** Normalisiert Produktnamen fuer den Duplikatvergleich (Digistore24-seitig). */
export function productNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type CreateDecision = {
  toCreate: ProductIdea[];
  skipped: Array<{ slug: string; reason: "not_approved" | "already_local" | "already_remote" | "cap_reached" }>;
};

/**
 * Waehlt die Ideen fuer diesen Lauf. `localSlugs` sind bereits angelegte
 * Produkte (aus revenue_offers), `remoteNames` die Namen, die Digistore24
 * aktuell kennt (aus listProducts) — damit entstehen auch dann keine
 * Doppel, wenn die lokale Zeile fehlt.
 */
export function planNextProducts(input: {
  ideas: ProductIdea[];
  localSlugs: ReadonlySet<string>;
  remoteNames: Iterable<string>;
  maxProducts: number;
  totalCreated: number;
}): CreateDecision {
  const remote = new Set<string>();
  for (const name of input.remoteNames) remote.add(productNameKey(name));
  const limit = Math.max(0, Math.min(
    Math.trunc(input.maxProducts),
    MAX_PRODUCTS_PER_RUN,
    MAX_AUTOPILOT_PRODUCTS_TOTAL - input.totalCreated,
  ));
  const toCreate: ProductIdea[] = [];
  const skipped: CreateDecision["skipped"] = [];
  for (const idea of input.ideas) {
    if (toCreate.length >= limit) {
      skipped.push({ slug: idea.slug, reason: "cap_reached" });
      continue;
    }
    if (!idea.approved) { skipped.push({ slug: idea.slug, reason: "not_approved" }); continue; }
    if (input.localSlugs.has(idea.slug)) { skipped.push({ slug: idea.slug, reason: "already_local" }); continue; }
    if (remote.has(productNameKey(idea.name))) { skipped.push({ slug: idea.slug, reason: "already_remote" }); continue; }
    toCreate.push(idea);
  }
  return { toCreate, skipped };
}

export function euroAmount(priceCents: number): string {
  return (priceCents / 100).toFixed(2);
}

/** Anzeigetext wie Digistore24 ihn selbst baut ("Monatlich 49 €"). */
export function intervalLabel(idea: ProductIdea): string {
  const amount = Math.round(idea.priceCents / 100);
  switch (idea.interval) {
    case "1_month": return `Monatlich ${amount} €`;
    case "3_month": return `Alle 3 Monate ${amount} €`;
    case "6_month": return `Alle 6 Monate ${amount} €`;
    case "12_month": return `Jährlich ${amount} €`;
    default: return `${amount} €`;
  }
}

export function checkoutUrl(productId: string | number): string {
  return `https://www.checkout-ds24.com/product/${String(productId).trim()}`;
}

/** Parameter fuer Digistore24 createProduct. */
export function buildCreateProductParams(idea: ProductIdea, options: {
  thankYouUrl: string;
} ): Record<string, string> {
  return {
    "data[name_de]": idea.name,
    "data[name_intern]": idea.name,
    "data[currency]": "EUR",
    "data[product_type_id]": String(DIGISTORE24_PRODUCT_TYPE_SOFTWARE),
    "data[language]": "de",
    "data[description_de]": idea.description,
    "data[access_instructions_de]": idea.accessInstructions,
    "data[is_search_engine_allowed]": "N",
    "data[thankyou_url]": options.thankYouUrl,
  };
}

/** Parameter fuer Digistore24 createPaymentPlan (Abo mit gleichbleibender Rate). */
export function buildPaymentPlanParams(idea: ProductIdea, productId: string | number): Record<string, string> {
  const amount = euroAmount(idea.priceCents);
  return {
    product_id: String(productId),
    "data[first_amount]": amount,
    "data[currency]": "EUR",
    "data[other_amounts]": amount,
    "data[first_billing_interval]": idea.interval,
    "data[other_billing_intervals]": idea.interval,
    "data[number_of_installments]": "0",
    "data[is_active]": "Y",
  };
}

/** Liest die Produkt-ID aus einer createProduct-Antwort; null wenn unbrauchbar. */
export function readCreatedProductId(response: unknown): string | null {
  const data = (response as { data?: Record<string, unknown> } | null)?.data;
  const id = data?.product_id ?? data?.id;
  if (id === undefined || id === null) return null;
  const text = String(id).trim();
  return /^\d+$/.test(text) ? text : null;
}

/** Liest die Payment-Plan-ID aus einer createPaymentPlan-Antwort. */
export function readCreatedPaymentPlanId(response: unknown): string | null {
  const data = (response as { data?: Record<string, unknown> } | null)?.data;
  const id = data?.paymentplan_id ?? data?.id;
  if (id === undefined || id === null) return null;
  const text = String(id).trim();
  return /^\d+$/.test(text) ? text : null;
}

/** Fehlertext ohne Schluessel/URLs, geeignet fuer Logs und die DB. */
export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return raw.replace(/[A-Za-z0-9_-]{28,}/g, "***").slice(0, 300);
}

/** Kennzahlen fuer das Abschlusslog eines Laufs. */
export function summarizeRun(result: {
  created: Array<{ slug: string }>; skipped: Array<{ slug: string; reason: string }>; failed: Array<{ slug: string }>;
}): string {
  return `${result.created.length} angelegt, ${result.skipped.length} uebersprungen, ${result.failed.length} fehlgeschlagen`;
}

/** Der Autopilot legt Produkte an, verkauft sie aber nicht: Freigabe ist manuell. */
export function autopilotProductStatus(): "awaiting_approval" {
  return "awaiting_approval";
}
