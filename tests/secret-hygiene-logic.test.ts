/**
 * Sprint 331 — Tests fuer Geheimnis-Hygiene.
 *
 * Hinweis: Alle Beispiel-Token werden zur Laufzeit aus Fragmenten
 * zusammengesetzt, damit im Quelltext NIE ein vollstaendiges
 * Geheimnis-Muster steht (Gitleaks bleibt gruen). Jeder Test-Token
 * ist frei erfunden und nicht benutzbar.
 */
import { describe, it, expect } from "vitest";
import {
  scanForSecrets,
  maskSecrets,
  checkVaultCoverage,
  formatScanSummary,
} from "@/lib/secret-hygiene-logic";

// Fragment-Baukasten: kein vollstaendiges Muster als Literal im Source.
const openaiToken = ["sk-", "proj-", "abcdef1234567890abcdef"].join("");
const googleToken = ["AIza", "Sy", "ABCDEF1234567890", "abcdefghijklmnop"].join("");
const stripeToken = ["sk_", "test_", "1234567890abcdef"].join("");
const awsToken = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
const dbConnWithPw = ["postgres", "user:pw@host/db"].join("://");
const dbConnNoPw = ["postgres", "host/db"].join("://");

describe("Sprint 331 — Geheimnis-Hygiene", () => {
  it("erkennt bekannte Geheimnis-Muster praefix-gebunden", () => {
    const hits = scanForSecrets(`key: ${openaiToken} und ${googleToken}`);
    const ids = hits.map((h) => h.patternId);
    expect(ids).toContain("openai-key");
    expect(ids).toContain("google-api-key");
  });

  it("maskiert Treffer im Text, Klartext verschwindet", () => {
    const masked = maskSecrets(`token=${stripeToken}`);
    expect(masked).toContain("MASKIERT");
    expect(masked).not.toContain(stripeToken);
  });

  it("DB-Strings mit Passwort werden erkannt, ohne nicht", () => {
    expect(scanForSecrets(dbConnWithPw).map((h) => h.patternId)).toContain("db-conn");
    expect(scanForSecrets(dbConnNoPw)).toHaveLength(0);
  });

  it("Vault-Abdeckung: Nicht-Vault-Quellen sind Luecken mit Namen", () => {
    const r = checkVaultCoverage([
      { name: "STRIPE_KEY", source: "vault" },
      { name: "DB_URL", source: "plaintext-datei" },
      { name: "MAIL_PW", source: "unbekannt" },
    ]);
    expect(r.covered).toEqual(["STRIPE_KEY"]);
    expect(r.uncovered).toEqual(["DB_URL", "MAIL_PW"]);
    expect(r.report).toContain("NICHT aus dem Vault");
    const ok = checkVaultCoverage([{ name: "A", source: "vault" }]);
    expect(ok.report).toContain("vollstaendig");
  });

  it("leerer Scan bleibt ehrlich: ersetzt keinen Gitleaks-Lauf", () => {
    expect(formatScanSummary([])).toContain("ersetzt keinen Gitleaks-Lauf");
    expect(formatScanSummary(scanForSecrets(awsToken)).toLowerCase()).toContain("aws");
  });
});
