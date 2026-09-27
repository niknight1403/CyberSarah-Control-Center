/**
 * Sprint 331 — Geheimnis-Hygiene: reine, deterministische Logik fuer
 * erweiterte Regex-Guards und Vault-Abdeckung.
 *
 * Datenfluss:
 *   Zu pruefende Texte werden gegen Geheimnis-Muster gescannt, Treffer
 *   maskiert; die Env-Versorgung wird gegen die Vault-Abdeckung
 *   geprueft — jedes Secret muss aus dem Vault stammen.
 *
 * Ehrlichkeits-Grenze: Maskieren ohne Fund ist kein "alles sicher" —
 *   Nicht-Vault-Quellen werden als Luecke gemeldet, egal ob ein Leck
 *   gefunden wurde. Gitleaks bleibt Pflicht, das ersetzt es nicht.
 */

export type SecretPattern = {
  id: string;
  test: RegExp;
  label: string;
};

/** Erweiterte Guard-Muster (Praefix-gebunden, um False Positives zu sparen). */
export const SECRET_PATTERNS: SecretPattern[] = [
  { id: "openai-key", test: /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/, label: "OpenAI-Key" },
  { id: "stripe-key", test: /(?:sk|rk)_(?:test|live)_[A-Za-z0-9]{16,}/, label: "Stripe-Key" },
  { id: "google-api-key", test: /AIza[0-9A-Za-z_-]{30,}/, label: "Google-API-Key" },
  { id: "aws-access", test: /AKIA[0-9A-Z]{16}/, label: "AWS-Access-Key" },
  { id: "private-key", test: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, label: "Privater Schluessel" },
  { id: "db-conn", test: /(?:postgres|postgresql|mysql|mongodb(\+srv)?):\/\/[^\s"']*:[^\s"']*@/, label: "DB-Verbindungsstring mit Passwort" },
  { id: "bearer", test: /Bearer\s+[A-Za-z0-9._-]{20,}/, label: "Bearer-Token" },
];

export type ScanHit = { patternId: string; label: string; maskedPreview: string };

/** Scannt einen Text und liefert maskierte Treffer-Vorschau. */
export function scanForSecrets(text: string): ScanHit[] {
  const hits: ScanHit[] = [];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test.test(text)) {
      hits.push({
        patternId: pattern.id,
        label: pattern.label,
        maskedPreview: `[${pattern.label} MASKIERT]`,
      });
    }
  }
  return hits;
}

/** Ersetzt alle Treffer im Text durch Masken (fuer Logs). */
export function maskSecrets(text: string): string {
  let masked = text;
  for (const pattern of SECRET_PATTERNS) {
    masked = masked.replace(pattern.test, `[${pattern.label} MASKIERT]`);
  }
  return masked;
}

export type EnvSecretSource = {
  name: string;
  source: "vault" | "plaintext-datei" | "unbekannt";
};

/** Vault-Abdeckung: jedes Secret MUSS aus dem Vault stammen. */
export function checkVaultCoverage(secrets: EnvSecretSource[]): {
  covered: string[];
  uncovered: string[];
  report: string;
} {
  const covered = secrets.filter((s) => s.source === "vault").map((s) => s.name);
  const uncovered = secrets.filter((s) => s.source !== "vault").map((s) => s.name);
  const report =
    uncovered.length === 0
      ? `Vault-Abdeckung vollstaendig (${covered.length} Secrets).`
      : `Vault-Luecken: ${uncovered.join(", ")} — diese Secrets stammen NICHT aus dem Vault.`;
  return { covered, uncovered, report };
}

/** Ehrliche Meldung pro Fund fuer die CI-Zusammenfassung. */
export function formatScanSummary(hits: ScanHit[]): string {
  if (hits.length === 0) return "Keine bekannten Geheimnis-Muster gefunden (Guard-Scan, ersetzt keinen Gitleaks-Lauf).";
  return hits.map((h) => `${h.patternId}: ${h.maskedPreview}`).join("; ");
}
