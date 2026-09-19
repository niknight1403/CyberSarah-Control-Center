/**
 * CyberSarah Control Center — Secret-Vault (Sprint 167, Server)
 *
 * Sichere Ablage von Secrets (API-Keys, Tokens) JE NUTZER — verschluesselt
 * mit derselben AES-256-GCM-Infrastruktur wie die Provider-Keys (Phase 11):
 *
 *   - Schluessel: scrypt(PROVIDER_KEY_ENCRYPTION_SECRET ?? JWT_SECRET)
 *   - Speicher  : KV (setModelRouterSetting/getModelRouterSetting) —
 *     identisch zum Provider-Key-Store, also ohne neue Migration.
 *   - Klartext-Regel: Werte werden NUR transient entschluesselt; alle
 *     Schnittstellen (Liste, Chat-Hinweis) ausschliesslich Metadaten +
 *     maskierte Vorschau.
 *
 * Chat-Integration (Superagent UND Repo-/Entwicklungs-Chat):
 *   processSecretsInUserMessage() erkennt Key-Muster in einer Nachricht,
 *   speichert sie autonom im Vault, maskiert den Klartext und liefert einen
 *     ehrlichen Hinweis — exakt wie der Base44-Superagent-Chat.
 */

import * as db from "./db";
import { decryptSecret, encryptSecret, maskApiKey } from "../lib/provider-admin-logic";
import {
  buildSecretStoredNotice,
  detectSecretCandidates,
  isValidSecretName,
  isValidSecretValue,
  maskSecretValue,
  normalizeSecretName,
  type SecretCandidate,
  type SecretKind,
  type SecretVaultEntryMeta,
} from "../lib/secret-vault-logic";

interface StoredVaultEntry {
  name: string;
  kind: SecretKind;
  /** AES-256-GCM: iv:tag:ciphertext (hex). */
  encrypted: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

type VaultMap = Record<string, StoredVaultEntry>;

function vaultKey(userOpenId: string): string {
  return `secrets.vault.${userOpenId}`;
}

function encryptionSecret(): string {
  const secret = (process.env.PROVIDER_KEY_ENCRYPTION_SECRET ?? process.env.JWT_SECRET ?? "").trim();
  if (!secret) {
    throw new Error(
      "Kein Server-Secret für die Vault-Verschlüsselung verfügbar. Setze JWT_SECRET oder PROVIDER_KEY_ENCRYPTION_SECRET — die Secret-Ablage bleibt solange deaktiviert.",
    );
  }
  return secret;
}

async function readVault(userOpenId: string): Promise<VaultMap> {
  return (await db.getModelRouterSetting<VaultMap>(vaultKey(userOpenId))) ?? {};
}

async function writeVault(userOpenId: string, vault: VaultMap): Promise<void> {
  await db.setModelRouterSetting(vaultKey(userOpenId), vault);
}

function toMeta(entry: StoredVaultEntry): SecretVaultEntryMeta {
  let hint: string;
  try {
    hint = maskApiKey(decryptSecret(entry.encrypted, encryptionSecret()));
  } catch {
    hint = "••••••"; // beschädigter Datensatz: nie den Klartext erraten
  }
  return {
    name: entry.name,
    kind: entry.kind,
    hint: hint || maskSecretValue(entry.name), // Fallback, falls Maskierung leer ist
    note: entry.note,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/** Legt ein Secret an oder aktualisiert es (verschlüsselt, nie Klartext raus). */
export async function upsertSecret(
  userOpenId: string,
  input: { name: string; value: string; kind?: SecretKind; note?: string },
): Promise<SecretVaultEntryMeta> {
  const name = normalizeSecretName(input.name);
  if (!isValidSecretName(name)) {
    throw new Error(`UNGUELTIGER_NAME: '${input.name}' — 3-40 Zeichen, nur A-Z/0-9/_ (z. B. GROQ_API_KEY).`);
  }
  if (!isValidSecretValue(input.value)) {
    throw new Error(`UNGUELTIGER_WERT: 8-4096 Zeichen erwartet, ohne umgebende Leerzeichen.`);
  }
  const vault = await readVault(userOpenId);
  const now = new Date().toISOString();
  const existing = vault[name];
  vault[name] = {
    name,
    kind: input.kind ?? existing?.kind ?? "custom",
    encrypted: encryptSecret(input.value.trim(), encryptionSecret()),
    note: input.note?.trim().slice(0, 200) || existing?.note,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await writeVault(userOpenId, vault);
  return toMeta(vault[name]);
}

/** Alle Secrets des Nutzers — NUR Metadaten + maskierte Vorschau. */
export async function listSecrets(userOpenId: string): Promise<SecretVaultEntryMeta[]> {
  const vault = await readVault(userOpenId);
  return Object.values(vault)
    .map(toMeta)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteSecret(userOpenId: string, name: string): Promise<boolean> {
  const vault = await readVault(userOpenId);
  const normalized = normalizeSecretName(name);
  if (!vault[normalized]) return false;
  delete vault[normalized];
  await writeVault(userOpenId, vault);
  return true;
}

/**
 * Interner Zugriff (nie UI): entschluesselt ein Secret fuer die Laufzeit
 * (z. B. Tools, Provider-Checks). Fehlschlag ist ehrlich null.
 */
export async function resolveSecret(userOpenId: string, name: string): Promise<string | null> {
  const vault = await readVault(userOpenId);
  const entry = vault[normalizeSecretName(name)];
  if (!entry) return null;
  try {
    return decryptSecret(entry.encrypted, encryptionSecret());
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Chat-Integration: Secrets in Nachrichten verarbeiten + sicher speichern
// ---------------------------------------------------------------------------

export interface SecretProcessingResult {
  /** Bereinigte Nachricht (Klartext ersetzt durch [NAME_GESPEICHERT]). */
  sanitizedText: string;
  /** Namen der neu gespeicherten Secrets. */
  storedNames: string[];
  /** Klartextfreier Hinweis fuer den Chatverlauf (null, wenn nichts erkannt). */
  notice: string | null;
}

/**
 * Verarbeitet EINE Nutzer-Nachricht: erkannte Keys werden autonom im
 * Vault gespeichert, der Klartext maskiert. Bestehende Namen (gleicher
 * Wert bereits gespeichert) werden nicht doppelt angelegt.
 */
export async function processSecretsInUserMessage(userOpenId: string, text: string): Promise<SecretProcessingResult> {
  const candidates: SecretCandidate[] = detectSecretCandidates(text ?? "");
  if (candidates.length === 0) {
    return { sanitizedText: text ?? "", storedNames: [], notice: null };
  }

  const vault = await readVault(userOpenId);
  const now = new Date().toISOString();
  const storedNames: string[] = [];

  for (const candidate of candidates) {
    const candidateHashKey = normalizeSecretName(candidate.suggestedName);
    const existingEntry = vault[candidateHashKey];
    let alreadyStored = false;
    if (existingEntry) {
      try {
        alreadyStored = decryptSecret(existingEntry.encrypted, encryptionSecret()) === candidate.value;
      } catch {
        alreadyStored = false;
      }
    }
    if (!alreadyStored) {
      vault[candidateHashKey] = {
        name: candidateHashKey,
        kind: candidate.kind,
        encrypted: encryptSecret(candidate.value, encryptionSecret()),
        createdAt: existingEntry?.createdAt ?? now,
        updatedAt: now,
      };
    }
    if (!storedNames.includes(candidateHashKey)) storedNames.push(candidateHashKey);
  }
  await writeVault(userOpenId, vault);

  let sanitizedText = text;
  for (const candidate of candidates) {
    const replacement = `[${normalizeSecretName(candidate.suggestedName)}_GESPEICHERT]`;
    sanitizedText = sanitizedText.split(candidate.value).join(replacement);
  }
  return { sanitizedText, storedNames, notice: buildSecretStoredNotice(storedNames) };
}
