/**
 * Digistore24 Ledger: deterministic validation, monetary normalization,
 * provenance, bounded API reads and minimization before database writes.
 * No network, DB or secrets access in this module.
 */
import { createHash, createHmac } from "node:crypto";

export type D24EventKind = "sale" | "refund" | "chargeback";
export type D24Record = Record<string, unknown>;

export function boundedSyncDays(input: unknown): number {
  const value = Number(input);
  return Number.isInteger(value) ? Math.min(90, Math.max(1, value)) : 30;
}

export function boundedPageCount(input: unknown): number {
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? Math.min(20, Math.ceil(value)) : 1;
}

export function commissionCents(value: unknown, kind: D24EventKind): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(number)) throw new Error("D24_INVALID_AMOUNT");
  const absolute = Math.round(Math.abs(number) * 100);
  if (!Number.isSafeInteger(absolute) || absolute > 2_000_000_000) throw new Error("D24_AMOUNT_OUT_OF_RANGE");
  return kind === "sale" ? absolute : -absolute;
}

export function transactionIdentity(record: D24Record): string {
  const id = record.id ?? record.transaction_id ?? record.transactionId ?? record.purchase_id ?? record.purchaseId;
  if (typeof id !== "string" && typeof id !== "number") throw new Error("D24_MISSING_TRANSACTION_ID");
  const value = String(id).trim();
  if (!value || value.toLowerCase() === "unknown") throw new Error("D24_MISSING_TRANSACTION_ID");
  return value;
}

export function ledgerOrderKey(source: "api" | "ipn", identity: string, kind: D24EventKind): string {
  // Preserve pre-hardening keys so existing recorded events cannot be counted a second time.
  const legacy = source === "api" ? `d24:${identity}:${kind}` : identity;
  if (legacy.length <= 200 && [...legacy].every(ch => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126)) return legacy;
  // For oversized/untrusted IDs avoid truncation collisions, keeping the DB's 200 char limit.
  const digest = createHash("sha256").update(identity).digest("hex");
  return `d24:${source}:${kind}:${digest}`;
}

export function parseCommissionDate(value: unknown, fallback: Date): Date {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const raw = value.trim();
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(/[zZ]$|[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export function commissionProductSlug(record: D24Record): string | null {
  const raw = record.product_id ?? record.productId ?? record.product_name;
  if (raw === null || raw === undefined) return null;
  const slug = String(raw).toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,120);
  return slug || null;
}

export function safeProductUrl(record: D24Record): string {
  const id = record.product_id ?? record.productId;
  const value = id == null ? "" : String(id);
  return /^\d{1,12}$/.test(value)
    ? `https://www.digistore24.com/product/${value}/`
    : "https://www.digistore24.com/marketplace/";
}

/** Explicit allow-list: never persist buyer_email, names, addresses, bank or phone. */
export function minimalCommissionPayload(record: D24Record): D24Record {
  const allowed = [
    "id","created_at","createdAt","amount","currency","purchase_id","purchaseId",
    "transaction_id","transactionId","product_name","product_id","productId",
    "transaction_type","transactionType","reason",
  ];
  const result: D24Record = {};
  for (const key of allowed) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") {
      result[key] = typeof value === "string" ? value.slice(0, 300) : value;
    }
  }
  return result;
}

export function minimalIpnPayload(fields: Record<string, string>): D24Record {
  const allowed = ["order_id","order","event","status","sale_status","product_id","product_name","currency","amount","gross_amount","commission","net_amount"];
  const record: D24Record = {};
  for (const key of allowed) if (fields[key] != null) record[key] = fields[key].slice(0,300);
  return record;
}

export function hashedBuyerEmail(email: unknown, secret: string | undefined): string | null {
  if (typeof email !== "string" || !email.trim() || !secret) return null;
  return createHmac("sha256",secret).update(email.trim().toLowerCase()).digest("hex");
}

export function validSha512Hex(signature: string): boolean {
  return /^[a-f0-9]{128}$/i.test(signature);
}

export function shouldPollCommissions(input: { apiKey?: string; ipnSecret?: string }): boolean {
  // Polling is a fallback, not a second independent revenue counter.
  return Boolean(input.apiKey?.trim()) && !Boolean(input.ipnSecret?.trim());
}

export function normalizeApiFailure(body: {result?: string;code?: unknown} | null, httpStatus: number): "AUTH_INVALID" | "RATE_LIMIT" | "UNAVAILABLE" | "REJECTED" {
  const code = Number(body?.code);
  if (code === 2 || httpStatus === 401 || httpStatus === 403) return "AUTH_INVALID";
  if (httpStatus === 429) return "RATE_LIMIT";
  if (httpStatus >= 500 || httpStatus === 0) return "UNAVAILABLE";
  return "REJECTED";
}
