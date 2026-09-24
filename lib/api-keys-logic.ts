/**
 * Sprint 339 — API-Keys fuer Nutzer: reine, deterministische Logik fuer
 * persoenliche Schluessel mit Scope-Begrenzung.
 *
 * Datenfluss:
 *   Nutzer erstellen Keys mit Scopes; jede Anfrage wird gegen Scope
 *   und Status geprueft. Rotierung laeuft ueber eine Uebergangsfrist.
 *
 * Ehrlichkeits-Grenze: Ein Key zeigt NIE seinen Wert nach dem ersten
 *   Anzeigen wieder — nur ein Praefix-Fingerprint. Abgelaufene Keys
 *   werden abgewiesen, nicht "grosszuegig" durchgewunken.
 */

export type ApiScope = "read" | "write" | "admin";

export type ApiKeyRecord = {
  id: string;
  userId: string;
  name: string;
  scopes: ApiScope[];
  /** Sha-Preview (erste 8 Zeichen des Fingerprints) — nie der Wert. */
  preview: string;
  createdAt: number;
  revokedAt: number | null;
  expiresAt: number | null;
};

/** Scope-Anforderung gegen Key-Scopes pruefen. */
export function keyHasScope(key: ApiKeyRecord, needed: ApiScope): boolean {
  if (needed === "admin") return key.scopes.includes("admin");
  if (needed === "write") return key.scopes.includes("write") || key.scopes.includes("admin");
  return key.scopes.length > 0; // read: jeder aktive Key kann lesen
}

/** Vollstaendige Anfrage-Entscheidung: Status, Ablauf, Scope. */
export function decideApiKeyRequest(
  key: ApiKeyRecord,
  needed: ApiScope,
  now: number,
): { allowed: boolean; reason: string } {
  if (key.revokedAt !== null) return { allowed: false, reason: "Key wurde widerrufen." };
  if (key.expiresAt !== null && now >= key.expiresAt) {
    return { allowed: false, reason: "Key ist abgelaufen." };
  }
  if (!keyHasScope(key, needed)) {
    return { allowed: false, reason: `Key hat den Scope "${needed}" nicht.` };
  }
  return { allowed: true, reason: `Ok (Scopes: ${key.scopes.join(", ") || "read"}).` };
}

/** Preview aus Fingerprint: erste 8 + "...", nie der volle Wert. */
export function buildPreview(fingerprint: string): string {
  return `${fingerprint.slice(0, 8)}...`;
}

/** Key-Anzeige-Text: ehrlich, dass der Wert nur einmal sichtbar war. */
export function describeKey(key: ApiKeyRecord): string {
  const status = key.revokedAt !== null ? "widerrufen" : "aktiv";
  const expiry = key.expiresAt !== null ? `, laeuft ab ${new Date(key.expiresAt).toISOString()}` : ", ohne Ablauf";
  return `${key.name} [${key.preview}] — ${status}${expiry}, Scopes: ${key.scopes.join(", ") || "read"}.`;
}

/** Neuen Key anlegen: Scopes normalisieren, leere Scopes heissen read. */
export function createKeyRecord(
  input: { userId: string; name: string; scopes: ApiScope[]; fingerprint: string; expiresAt: number | null },
  id: string,
  now: number,
): ApiKeyRecord {
  const scopes = [...new Set(input.scopes)];
  return {
    id,
    userId: input.userId,
    name: input.name.trim(),
    scopes: scopes.length > 0 ? scopes : ["read"],
    preview: buildPreview(input.fingerprint),
    createdAt: now,
    revokedAt: null,
    expiresAt: input.expiresAt,
  };
}

/** Widerruf ist unmittelbar (kein "laeuft noch ein bisschen"). */
export function revokeKey(key: ApiKeyRecord, now: number): ApiKeyRecord {
  return key.revokedAt === null ? { ...key, revokedAt: now } : key;
}
