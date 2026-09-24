import { describe, it, expect } from "vitest";
import {
  scanForSecrets,
  maskSecrets,
  checkVaultCoverage,
  formatScanSummary,
} from "@/lib/secret-hygiene-logic";

describe("Sprint 331 — Geheimnis-Hygiene", () => {
  it("erkennt bekannte Geheimnis-Muster praefix-gebunden", () => {
    const hits = scanForSecrets("key: sk-proj-abcdef1234567890abcdef und AIzaSyABCDEF1234567890abcdefghijklmnop");
    const ids = hits.map((h) => h.patternId);
    expect(ids).toContain("openai-key");
    expect(ids).toContain("google-api-key");
  });

  it("maskiert Treffer im Text, Klartext verschwindet", () => {
    const masked = maskSecrets("token=sk_test_1234567890abcdef");
    expect(masked).toContain("MASKIERT");
    expect(masked).not.toContain("sk_test_1234567890abcdef");
  });

  it("DB-Strings mit Passwort werden erkannt, ohne nicht", () => {
    expect(scanForSecrets("postgres://user:pw@host/db").map((h) => h.patternId)).toContain("db-conn");
    expect(scanForSecrets("postgres://host/db")).toHaveLength(0);
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
    expect(formatScanSummary(scanForSecrets("AKIAABCDEFGHIJKLMNOP"))).toContain("aws-access");
  });
});
