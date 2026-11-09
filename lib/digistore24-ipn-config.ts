/**
 * Aufloesung der Digistore24-IPN-Passphrase(n).
 *
 * Ein Betrieb kann mehrere Kandidaten hinterlegen (Passphrase-Wechsel, oder
 * weil beim Einrichten mehrere Werte im Umlauf waren). Deshalb wird der Wert
 * als Liste gelesen: Trenner sind Komma, Semikolon und Zeilenumbruch.
 * `DIGISTORE24_IPN_SECRET` hat Vorrang vor dem alten Alias
 * `DIGISTORE24_IPN_PASSPHRASE`. Ein leerer Treffer zaehlt nicht.
 *
 * Fail-closed bleibt: gibt es keinen einzigen brauchbaren Kandidaten, liefert
 * die Liste nichts und der IPN-Endpunkt antwortet weiterhin 503.
 */

import crypto from "node:crypto";

const SEPARATORS = /[,;\n\r]+/;

export function resolveDigistore24IpnSecrets(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const raw = env.DIGISTORE24_IPN_SECRET?.trim() || env.DIGISTORE24_IPN_PASSPHRASE?.trim() || "";
  if (!raw) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(SEPARATORS)) {
    const value = part.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/** Erster Kandidat — Kompatibilitaet fuer Aufrufer, die nur ein Secret brauchen. */
export function resolveDigistore24IpnSecret(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return resolveDigistore24IpnSecrets(env)[0];
}

/**
 * Stabiler, nicht umkehrbarer Fingerabdruck eines Kandidaten. Damit laesst
 * sich im Betrieb erkennen, welche Passphrase gegriffen hat, ohne das
 * Geheimnis zu protokollieren.
 */
export function ipnSecretFingerprint(secret: string): string {
  return crypto.createHash("sha256").update(secret, "utf8").digest("hex").slice(0, 8);
}
