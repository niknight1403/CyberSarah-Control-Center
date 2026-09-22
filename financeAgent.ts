/**
 * FinanceAgent – arbeitet ausschließlich mit ECHTEN Stripe-Daten.
 *
 * Grundsatz: Dieser Agent erfindet keinen Umsatz. Er meldet nur, was Stripe
 * tatsächlich verbucht hat. Im TEST-Modus (sk_test_) kennzeichnet er alles
 * deutlich als Testgeld.
 *
 * Autonome Aufgaben:
 *  - sicherstellen, dass ein verkaufbares Produkt + Payment-Link existiert
 *  - Umsatz der letzten 24h/7T aus echten Charges aggregieren
 *  - fehlgeschlagene Zahlungen erkennen und melden
 */

const STRIPE = "https://api.stripe.com/v1";

function authHeaders() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY fehlt – FinanceAgent kann nicht arbeiten.");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" };
}

export function stripeMode(): "live" | "test" | "missing" {
  const k = process.env.STRIPE_SECRET_KEY ?? "";
  if (!k) return "missing";
  return k.startsWith("sk_live_") ? "live" : "test";
}

/** Legt einmalig Produkt + Preis + Payment-Link an, falls noch nicht vorhanden. */
export async function ensurePaymentLink(
  productName: string,
  amountCents: number,
  currency = "eur",
): Promise<{ url: string; created: boolean }> {
  const h = authHeaders();
  const links = await fetch(`${STRIPE}/payment_links?limit=100&active=true`, { headers: h }).then(r => r.json());
  const existing = links.data?.find((l: any) => l.metadata?.agent === "cybersarah");
  if (existing) return { url: existing.url, created: false };

  const product = await fetch(`${STRIPE}/products`, {
    method: "POST",
    headers: h,
    body: new URLSearchParams({ name: productName }),
  }).then(r => r.json());
  if (product.error) throw new Error(`Produkt: ${product.error.message}`);

  const price = await fetch(`${STRIPE}/prices`, {
    method: "POST",
    headers: h,
    body: new URLSearchParams({
      product: product.id,
      unit_amount: String(amountCents),
      currency,
    }),
  }).then(r => r.json());
  if (price.error) throw new Error(`Preis: ${price.error.message}`);

  const link = await fetch(`${STRIPE}/payment_links`, {
    method: "POST",
    headers: h,
    body: new URLSearchParams({
      "line_items[0][price]": price.id,
      "line_items[0][quantity]": "1",
      "metadata[agent]": "cybersarah",
    }),
  }).then(r => r.json());
  if (link.error) throw new Error(`Payment-Link: ${link.error.message}`);
  return { url: link.url, created: true };
}

export interface RevenueReport {
  mode: "live" | "test";
  last24hCents: number;
  last7dCents: number;
  currency: string;
  chargeCount7d: number;
  failed7d: number;
  note: string;
  generatedAt: string;
}

/** Aggregiert ausschließlich real verbuchte Stripe-Charges. */
export async function runFinanceAgent(): Promise<RevenueReport> {
  const h = authHeaders();
  const now = Math.floor(Date.now() / 1000);
  const since7d = now - 7 * 86400;
  const since24h = now - 86400;

  let last24h = 0, last7d = 0, count = 0, failed = 0, currency = "eur";
  let url = `${STRIPE}/charges?limit=100&created[gte]=${since7d}`;
  // Pagination sauber durchlaufen – keine Schätzwerte
  for (let page = 0; page < 10; page++) {
    const res = await fetch(url, { headers: h }).then(r => r.json());
    if (res.error) throw new Error(res.error.message);
    for (const c of res.data ?? []) {
      currency = c.currency ?? currency;
      if (c.status === "failed") { failed++; continue; }
      if (c.paid && !c.refunded) {
        last7d += c.amount;
        count++;
        if (c.created >= since24h) last24h += c.amount;
      }
    }
    if (!res.has_more || !res.data?.length) break;
    url = `${STRIPE}/charges?limit=100&created[gte]=${since7d}&starting_after=${res.data[res.data.length - 1].id}`;
  }

  const mode = stripeMode() as "live" | "test";
  return {
    mode,
    last24hCents: last24h,
    last7dCents: last7d,
    currency,
    chargeCount7d: count,
    failed7d: failed,
    note:
      mode === "live"
        ? "Echte verbuchte Zahlungen aus Stripe."
        : "TEST-Modus: Beträge sind Stripe-Testgeld, kein echter Umsatz.",
    generatedAt: new Date().toISOString(),
  };
}
