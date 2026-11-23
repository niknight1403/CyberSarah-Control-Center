/**
 * Block 2 (Multi-Tenancy) — API-Schluessel je Konto (Server-Service).
 *
 * Die Entscheidungslogik liegt in lib/api-key-logic.ts; hier steht nur I/O:
 * anlegen (Hash speichern, Klartext einmal zurueckgeben), auflisten (maskiert),
 * widerrufen und aufloesen (Bearer-Key -> Konto).
 *
 * Sicherheit: Der Klartext wird nirgends protokolliert. Ein unbekannter oder
 * widerrufener Schluessel liefert null — der Aufrufer antwortet mit 401, nicht
 * mit einem 500.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { tenantApiKeys, type TenantApiKeyRow } from "../drizzle/schema";
import { getDb } from "./db";
import {
  ApiKeyError,
  canCreateKey,
  expiresAtFromDays,
  generateApiKey,
  hashApiKey,
  isApiKeyUsable,
  isValidApiKeyFormat,
  maskApiKey,
  normalizeLabel,
  normalizeScope,
  type ApiKeyScope,
} from "../lib/api-key-logic";

export type ApiKeyView = {
  id: number;
  label: string;
  maskedKey: string;
  scope: ApiKeyScope;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type CreatedApiKey = ApiKeyView & {
  /** Einmalig sichtbar; danach nur noch der Hash in der Datenbank. */
  plaintextKey: string;
  warning: string;
};

export type ResolvedApiKey = {
  keyId: number;
  ownerOpenId: string;
  scope: ApiKeyScope;
};

function toView(row: TenantApiKeyRow): ApiKeyView {
  return {
    id: row.id,
    label: row.label,
    maskedKey: maskApiKey(row.keyPrefix),
    scope: row.scope === "read" ? "read" : "write",
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    revokedAt: row.revokedAt ?? null,
  };
}

export async function listApiKeys(ownerOpenId: string): Promise<ApiKeyView[]> {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar.");
  const rows = await db
    .select()
    .from(tenantApiKeys)
    .where(eq(tenantApiKeys.ownerOpenId, ownerOpenId))
    .orderBy(desc(tenantApiKeys.createdAt));
  return rows.map(toView);
}

export async function createApiKey(input: {
  ownerOpenId: string;
  label: unknown;
  scope?: unknown;
  expiresInDays?: unknown;
}): Promise<CreatedApiKey> {
  const ownerOpenId = String(input.ownerOpenId ?? "").trim();
  if (!ownerOpenId) throw new Error("Ohne Konto kann kein Schluessel angelegt werden.");

  const label = normalizeLabel(input.label);
  const scope = normalizeScope(input.scope);
  const expiresAt = expiresAtFromDays(input.expiresInDays);

  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar.");

  const [activeCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tenantApiKeys)
    .where(and(eq(tenantApiKeys.ownerOpenId, ownerOpenId), isNull(tenantApiKeys.revokedAt)));

  if (!canCreateKey(Number(activeCount?.count ?? 0))) {
    throw new ApiKeyError(
      "limit-reached",
      "Die maximale Zahl aktiver Schluessel ist erreicht. Bitte zuerst einen Schluessel widerrufen.",
    );
  }

  const generated = generateApiKey();
  const [row] = await db
    .insert(tenantApiKeys)
    .values({
      ownerOpenId,
      label,
      keyPrefix: generated.keyPrefix,
      keyHash: generated.keyHash,
      scope,
      expiresAt: expiresAt ?? null,
    })
    .returning();

  return {
    ...toView(row),
    plaintextKey: generated.plaintext,
    warning: "Dieser Schluessel wird nur jetzt angezeigt. Spaeter ist nur noch der Anfang sichtbar.",
  };
}

export async function revokeApiKey(ownerOpenId: string, id: number): Promise<{ ok: true; alreadyRevoked: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Datenbank nicht verfuegbar.");
  const [row] = await db
    .select()
    .from(tenantApiKeys)
    .where(and(eq(tenantApiKeys.id, id), eq(tenantApiKeys.ownerOpenId, ownerOpenId)))
    .limit(1);

  if (!row) {
    // Kein Hinweis, ob der Schluessel existiert und nur fremd ist: gleiche Antwort.
    throw new ApiKeyError("invalid-label", "Schluessel nicht gefunden.");
  }
  if (row.revokedAt) return { ok: true, alreadyRevoked: true };

  await db.update(tenantApiKeys).set({ revokedAt: new Date() }).where(eq(tenantApiKeys.id, id));
  return { ok: true, alreadyRevoked: false };
}

/**
 * Loest einen Bearer-Schluessel auf. Aktualisiert lastUsedAt hoechstens einmal
 * pro Minute, damit ein hektischer Client die Tabelle nicht schreibt.
 */
export async function resolveApiKey(plaintext: string): Promise<ResolvedApiKey | null> {
  if (!isValidApiKeyFormat(plaintext)) return null;
  const db = await getDb();
  if (!db) return null;

  const [row] = await db
    .select()
    .from(tenantApiKeys)
    .where(eq(tenantApiKeys.keyHash, hashApiKey(plaintext.trim())))
    .limit(1);

  if (!row) return null;
  if (!isApiKeyUsable({ revokedAt: row.revokedAt, expiresAt: row.expiresAt })) return null;

  const lastUsed = row.lastUsedAt ? new Date(row.lastUsedAt).getTime() : 0;
  if (Date.now() - lastUsed > 60_000) {
    await db.update(tenantApiKeys).set({ lastUsedAt: new Date() }).where(eq(tenantApiKeys.id, row.id));
  }

  return { keyId: row.id, ownerOpenId: row.ownerOpenId, scope: row.scope === "read" ? "read" : "write" };
}
