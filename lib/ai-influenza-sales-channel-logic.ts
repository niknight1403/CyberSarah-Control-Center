/**
 * AI Influenza Team — Vertriebskanaele planen (Stripe und Digistore24).
 *
 * Zweck: aus den drei Paketen (299/999/2499 EUR monatlich) einen Katalog
 * bauen, der auf beiden Kanaelen dasselbe verkauft — und zwar nachvollziehbar:
 * hier entstehen nur Plaene und Nutzlasten, keine Netzwerkaufrufe.
 *
 * Warum kein direkter Aufruf: der Digistore24-Schluessel war am 2026-10-28
 * ungueltig (docs/2026-10-29_D24_LEDGER_10_SPRINTS.md). Ein Plan, der ohne
 * gueltigen Schluessel "fertig" meldet, waere wertlos. Der Autopilot fuehrt
 * die Schritte aus, sobald Schluessel und Freigabe da sind.
 *
 * Feldnamen folgen der Digistore24-API (createProduct, createPaymentplan,
 * Basis https://www.digistore24.com/api/call, Kopfzeile X-DS-API-Key).
 * Preise stehen bei Digistore24 nicht am Produkt, sondern im Zahlungsplan.
 */
import { AI_INFLUENZA_PACKAGES, AI_INFLUENZA_PRICE_ENV, type AiInfluenzaPackageId } from "./ai-influenza-team-logic";

export type SalesChannel = "stripe" | "digistore24";

export type ChannelStep = {
  /** Methode bzw. SDK-Aufruf, den der Autopilot ausfuehren wuerde. */
  method: string;
  /** Nutzlast, bereits in der Feldform des Anbieters. */
  payload: Record<string, unknown>;
  /** Wovon der Schritt abhaengt (z. B. Produkt-ID aus dem ersten Schritt). */
  usesResultOf?: string;
  /** true = ohne menschliche Freigabe nicht ausfuehren. */
  requiresReview: boolean;
  note?: string;
};

export type ChannelPlan = {
  channel: SalesChannel;
  packageId: AiInfluenzaPackageId;
  action: "create" | "skip";
  reason: string;
  /** Stabiler Schluessel gegen Doppelanlage bei wiederholten Laeufen. */
  idempotencyKey: string;
  steps: ChannelStep[];
  /** Env-Variable, in die die erzeugte Preis-ID gehoert (nur Stripe). */
  envTarget?: string;
  blockers: string[];
};

/** Betrag in Hauptwaehrung (299.00), wie Digistore24 ihn erwartet. */
export function toMajorUnits(cents: number): number {
  if (!Number.isFinite(cents) || cents < 0) throw new Error(`Betrag unbrauchbar: ${cents}`);
  return Math.round(cents) / 100;
}

/**
 * Adressen fuer Digistore24. Die App liefert beide Seiten selbst, deshalb sind
 * sie ohne Extra-Konfiguration gesetzt; DIGISTORE24_SALES_URL und
 * DIGISTORE24_THANKYOU_URL ueberschreiben sie, wenn woanders gehostet wird.
 */
export const DIGISTORE24_PAGE_PATHS = { salespage: "/ai-influenza", thankyou: "/ai-influenza-danke" } as const;

export function resolveDigistore24Urls(env: Record<string, string | undefined> = {}): {
  salespageUrl: string;
  thankyouUrl: string;
} {
  const base = (env.APP_BASE_URL?.trim() || "https://app.cybersarah-ki.com").replace(/\/+$/, "");
  return {
    salespageUrl: env.DIGISTORE24_SALES_URL?.trim() || `${base}${DIGISTORE24_PAGE_PATHS.salespage}`,
    thankyouUrl: env.DIGISTORE24_THANKYOU_URL?.trim() || `${base}${DIGISTORE24_PAGE_PATHS.thankyou}`,
  };
}

export function stripeLookupKey(packageId: AiInfluenzaPackageId): string {
  return `ai-influenza-${packageId}`;
}

export function stripeIdempotencyKey(packageId: AiInfluenzaPackageId): string {
  const pkg = AI_INFLUENZA_PACKAGES[packageId];
  // Preis im Schluessel: eine Preisaenderung darf einen neuen Preis erzeugen,
  // ein Wiederholungslauf mit gleichem Preis nicht.
  return `ai-influenza-catalog-${packageId}-${pkg.monthlyPriceCents}`;
}

/** Stripe: Produkt plus monatlicher Preis, Lookup-Key statt Suchen im Dashboard. */
export function planStripeCatalogEntry(
  packageId: AiInfluenzaPackageId,
  options: { existingPriceId?: string | null } = {},
): ChannelPlan {
  const pkg = AI_INFLUENZA_PACKAGES[packageId];
  const existing = options.existingPriceId?.trim();

  if (existing) {
    if (!existing.startsWith("price_")) {
      return {
        channel: "stripe",
        packageId,
        action: "skip",
        reason: `${AI_INFLUENZA_PRICE_ENV[packageId]} ist keine Stripe-Preis-ID.`,
        idempotencyKey: stripeIdempotencyKey(packageId),
        steps: [],
        envTarget: AI_INFLUENZA_PRICE_ENV[packageId],
        blockers: [`${AI_INFLUENZA_PRICE_ENV[packageId]}="${existing}" beginnt nicht mit price_.`],
      };
    }
    return {
      channel: "stripe",
      packageId,
      action: "skip",
      reason: `Preis bereits verdrahtet (${AI_INFLUENZA_PRICE_ENV[packageId]}).`,
      idempotencyKey: stripeIdempotencyKey(packageId),
      steps: [],
      envTarget: AI_INFLUENZA_PRICE_ENV[packageId],
      blockers: [],
    };
  }

  return {
    channel: "stripe",
    packageId,
    action: "create",
    reason: "Kein Preis hinterlegt, Katalog wird angelegt.",
    idempotencyKey: stripeIdempotencyKey(packageId),
    envTarget: AI_INFLUENZA_PRICE_ENV[packageId],
    steps: [
      {
        method: "products.create",
        requiresReview: false,
        payload: {
          name: `AI Influenza Team · ${pkg.name}`,
          description: pkg.deliverables.join(" · ").slice(0, 500),
          metadata: { businessUnit: "ai-influenza-team", packageId: pkg.id },
        },
      },
      {
        method: "prices.create",
        usesResultOf: "products.create",
        requiresReview: false,
        payload: {
          currency: pkg.currency,
          unit_amount: pkg.monthlyPriceCents,
          recurring: { interval: "month" },
          lookup_key: stripeLookupKey(packageId),
          transfer_lookup_key: true,
          metadata: { businessUnit: "ai-influenza-team", packageId: pkg.id },
        },
      },
    ],
    blockers: [],
  };
}

/**
 * Digistore24-Zahlungsplan. Der Intervall-Wortlaut ist bewusst als Annahme
 * markiert: Digistore24 dokumentiert `*_billing_interval` als Zeichenkette,
 * nennt in der Kurzreferenz aber kein Vokabular. Deshalb requiresReview=true
 * und is_active=false — ein falscher Intervalltext wuerde sonst als Einmal-
 * zahlung verkauft.
 */
export function digistore24PaymentPlanDraft(packageId: AiInfluenzaPackageId): ChannelStep {
  const pkg = AI_INFLUENZA_PACKAGES[packageId];
  return {
    method: "createPaymentplan",
    usesResultOf: "createProduct",
    requiresReview: true,
    note:
      "Intervall-Vokabular vor dem ersten Live-Lauf bestaetigen (Doku nennt kein Format). " +
      "Bis dahin is_active=false, damit nichts versehentlich als Einmalzahlung verkauft wird.",
    payload: {
      product_id: "<aus createProduct>",
      data: {
        first_amount: toMajorUnits(pkg.monthlyPriceCents),
        other_amounts: toMajorUnits(pkg.monthlyPriceCents),
        currency: pkg.currency.toUpperCase(),
        other_billing_intervals: "1_month",
        is_active: false,
      },
    },
  };
}

export function planDigistore24CatalogEntry(
  packageId: AiInfluenzaPackageId,
  options: {
    salespageUrl?: string;
    thankyouUrl?: string;
    imageUrl?: string;
    existingProductId?: string | null;
    apiKeyConfigured?: boolean;
  } = {},
): ChannelPlan {
  const pkg = AI_INFLUENZA_PACKAGES[packageId];
  const blockers: string[] = [];
  const existing = options.existingProductId?.trim();

  if (!options.apiKeyConfigured) blockers.push("DIGISTORE24_API_KEY fehlt.");
  if (!options.salespageUrl) blockers.push("salespage_url fehlt — Digistore24 braucht eine Verkaufsseite.");
  else if (!options.salespageUrl.startsWith("https://")) blockers.push("salespage_url muss https sein.");
  if (!options.thankyouUrl) blockers.push("thankyou_url fehlt — ohne Danke-Seite keine Auslieferung.");

  const idempotencyKey = `ai-influenza-d24-${packageId}-${pkg.monthlyPriceCents}`;

  if (existing) {
    return {
      channel: "digistore24",
      packageId,
      action: "skip",
      reason: `Produkt existiert bereits (${existing}).`,
      idempotencyKey,
      steps: [],
      blockers,
    };
  }

  return {
    channel: "digistore24",
    packageId,
    action: "create",
    reason: "Kein Produkt hinterlegt, Katalog wird angelegt.",
    idempotencyKey,
    blockers,
    steps: [
      {
        method: "createProduct",
        requiresReview: false,
        payload: {
          data: {
            name_intern: `ai-influenza-${pkg.id}`,
            name_de: `AI Influenza Team ${pkg.name}`,
            description_de: pkg.deliverables.join(" · ").slice(0, 500),
            ...(options.salespageUrl ? { salespage_url: options.salespageUrl } : {}),
            ...(options.thankyouUrl ? { thankyou_url: options.thankyouUrl } : {}),
            ...(options.imageUrl ? { image_url: options.imageUrl } : {}),
          },
        },
      },
      digistore24PaymentPlanDraft(packageId),
    ],
  };
}

/** Gesamtbild fuer den Autopilot: beide Kanaele, alle Pakete. */
export function planSalesCatalog(
  options: {
    env?: Record<string, string | undefined>;
    digistore24?: { salespageUrl?: string; thankyouUrl?: string; imageUrl?: string };
  } = {},
): { plans: ChannelPlan[]; creatable: number; blocked: number; needsReview: number } {
  const env = options.env ?? {};
  const digistore24 = { ...resolveDigistore24Urls(env), ...options.digistore24 };
  const plans: ChannelPlan[] = [];
  for (const packageId of Object.keys(AI_INFLUENZA_PACKAGES) as AiInfluenzaPackageId[]) {
    plans.push(planStripeCatalogEntry(packageId, { existingPriceId: env[AI_INFLUENZA_PRICE_ENV[packageId]] }));
    plans.push(
      planDigistore24CatalogEntry(packageId, {
        ...digistore24,
        apiKeyConfigured: Boolean(env.DIGISTORE24_API_KEY?.trim()),
        existingProductId: env[`DIGISTORE24_PRODUCT_ID_${packageId.toUpperCase()}`],
      }),
    );
  }
  return {
    plans,
    creatable: plans.filter((plan) => plan.action === "create" && plan.blockers.length === 0).length,
    blocked: plans.filter((plan) => plan.blockers.length > 0).length,
    needsReview: plans.reduce((sum, plan) => sum + plan.steps.filter((step) => step.requiresReview).length, 0),
  };
}
