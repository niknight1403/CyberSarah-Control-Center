/** Stripe Invoice API-Version-Kompatibilitaet (Basil und aelter). */
type InvoiceSubscriptionRef = string | { id: string } | null;
type InvoiceLike = {
  parent?: { subscription_details?: { subscription?: unknown; metadata?: unknown } | null } | null;
  subscription?: unknown;
  subscription_details?: { subscription?: unknown; metadata?: unknown } | null;
  metadata?: unknown;
};

function normalizeSubscriptionRef(value: unknown): InvoiceSubscriptionRef {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return { id: id.trim() };
  }
  return null;
}

function normalizeMetadata(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return entries.length ? Object.fromEntries(entries) : null;
}

/** Liefert die Subscription-Referenz aus modernen oder Legacy-Invoice-Feldern. */
export function invoiceSubscriptionReference(invoice: unknown): InvoiceSubscriptionRef {
  if (typeof invoice !== "object" || invoice === null) return null;
  const value = invoice as InvoiceLike;
  return normalizeSubscriptionRef(value.parent?.subscription_details?.subscription)
    ?? normalizeSubscriptionRef(value.subscription_details?.subscription)
    ?? normalizeSubscriptionRef(value.subscription);
}

/** Metadata der zugehoerigen Subscription-Details, mit Invoice-Metadata-Fallback. */
export function invoiceSubscriptionMetadata(invoice: unknown): Record<string, string> | null {
  if (typeof invoice !== "object" || invoice === null) return null;
  const value = invoice as InvoiceLike;
  return normalizeMetadata(value.parent?.subscription_details?.metadata)
    ?? normalizeMetadata(value.subscription_details?.metadata)
    ?? normalizeMetadata(value.metadata);
}
