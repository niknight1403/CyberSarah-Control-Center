import { describe, expect, it } from "vitest";

import {
  evaluateHITLRisk,
  isCriticalSystemCommand,
  isDestructiveSql,
  isHaraAutoApprove,
  HIGH_RISK_TRANSACTION_THRESHOLD_EUR,
  MASS_EMAIL_RECIPIENT_THRESHOLD,
} from "../lib/hitl-guard-logic";

/**
 * Sprint 161 — HITL-Guardrail-Regressionstests (V4.0-Abschnitt-5-Regeln).
 *
 * Die Logik ist die zentrale Human-in-the-Loop-Bewertung vor jeder
 * Agenten-/Tool-Ausfuehrung; der Orchestrator (tool-registry) ruft sie als
 * zweite Safety-Schicht nach der Allowlist auf. Diese Tests decken alle vier
 * Hochrisiko-Regeln plus HARA-Auto-Approve ab und ersetzen die fruehere
 * CLI-Resilienzprobe aus artifacts/api-server durch eine CI-faehige Suite.
 */
describe("evaluateHITLRisk — Regel 1: Transaktionen ueber 50 EUR", () => {
  it("Auto-Approve fuer Transaktionen unter dem Limit", () => {
    const result = evaluateHITLRisk("Auszahlung / Ad-Spend", { amount: 15 });
    expect(result.requiresConfirmation).toBe(false);
    expect(result.status).toBe("AUTO_APPROVED");
    expect(result.category).toBe("transaction");
  });

  it("HITL-Stopp bei Ad-Spend ueber 50,00 EUR (Kernfall: 120 EUR)", () => {
    const result = evaluateHITLRisk("Auszahlung / Ad-Spend", { amount: 120 });
    expect(result.requiresConfirmation).toBe(true);
    expect(result.status).toBe("OPERATOR_CONFIRM_REQUIRED");
    expect(result.reason).toContain("120.00");
  });

  it("Exakt 50,00 EUR bleibt Auto-Approve (strikt groesser-Pruefung)", () => {
    const result = evaluateHITLRisk("payout", { amount: HIGH_RISK_TRANSACTION_THRESHOLD_EUR });
    expect(result.requiresConfirmation).toBe(false);
  });

  it("Budget-Aktionen mit costEur-Feld werden genauso bewertet", () => {
    const result = evaluateHITLRisk("budget allocation", { costEur: 99.5 });
    expect(result.requiresConfirmation).toBe(true);
  });
});

describe("evaluateHITLRisk — Regel 2: Destruktives SQL", () => {
  it("Sichere Lese-Abfrage -> Auto-Approve", () => {
    const result = evaluateHITLRisk("Database Query", {
      query: "SELECT * FROM users WHERE active = true",
    });
    expect(result.requiresConfirmation).toBe(false);
    expect(result.category).toBe("database");
  });

  it("DROP TABLE -> HITL-Stopp", () => {
    const result = evaluateHITLRisk("Database Query", {
      query: "DROP TABLE user_credentials;",
    });
    expect(result.requiresConfirmation).toBe(true);
  });

  it("TRUNCATE und ALTER TABLE -> HITL-Stopp", () => {
    expect(evaluateHITLRisk("sql query", { query: "TRUNCATE TABLE audit;" }).requiresConfirmation).toBe(true);
    expect(evaluateHITLRisk("sql query", { query: "ALTER TABLE users DROP COLUMN x;" }).requiresConfirmation).toBe(true);
  });

  it("DELETE FROM ohne Constraint -> HITL-Stopp, mit ID-Constraint -> Auto-Approve", () => {
    const unsafe = evaluateHITLRisk("sql query", { query: "DELETE FROM sessions;" });
    expect(unsafe.requiresConfirmation).toBe(true);

    const safe = evaluateHITLRisk("sql query", {
      query: "DELETE FROM sessions WHERE id = 4711;",
    });
    expect(safe.requiresConfirmation).toBe(false);
  });
});

describe("evaluateHITLRisk — Regel 3: Kritische System-Kommandos", () => {
  it("sudo reboot -> HITL-Stopp", () => {
    const result = evaluateHITLRisk("System Call", { command: "sudo reboot now" });
    expect(result.requiresConfirmation).toBe(true);
    expect(result.category).toBe("system");
  });

  it("Shutdown, mkfs, dd und killall -> HITL-Stopp", () => {
    for (const command of ["shutdown -h now", "mkfs.ext4 /dev/sda1", "dd if=img.iso of=/dev/sdb", "killall node"]) {
      expect(evaluateHITLRisk("System Call", { command }).requiresConfirmation).toBe(true);
    }
  });

  it("SSH-Key-Manipulation und System-Flash -> HITL-Stopp", () => {
    expect(evaluateHITLRisk("System Call", { command: "echo key >> ~/.ssh/authorized_keys" }).requiresConfirmation).toBe(true);
    expect(evaluateHITLRisk("System Call", { command: "fastboot flash system.img" }).requiresConfirmation).toBe(true);
  });

  it("Unkritisches Kommando (uptime) -> Auto-Approve", () => {
    const result = evaluateHITLRisk("System Call", { command: "uptime" });
    expect(result.requiresConfirmation).toBe(false);
  });
});

describe("evaluateHITLRisk — Regel 4: Massen-E-Mails", () => {
  it("500 Empfaenger -> Auto-Approve, 501 -> HITL-Stopp", () => {
    const atLimit = evaluateHITLRisk("email dispatch", { recipients: MASS_EMAIL_RECIPIENT_THRESHOLD });
    expect(atLimit.requiresConfirmation).toBe(false);

    const overLimit = evaluateHITLRisk("email dispatch", { recipients: 501 });
    expect(overLimit.requiresConfirmation).toBe(true);
    expect(overLimit.category).toBe("email");
  });
});

describe("HARA-Auto-Approve (ROI > 90, Kosten 0,00 EUR, RiskLevel LOW)", () => {
  it("volle HARA-Bedingung -> vollautonome Freigabe", () => {
    const result = evaluateHITLRisk("HARA Finanz-Entscheidung", {
      roiScore: 94,
      costEur: 0,
      riskLevel: "LOW",
    });
    expect(result.requiresConfirmation).toBe(false);
    expect(result.category).toBe("hara");
    expect(result.reason).toContain("HARA-Auto-Approve");
  });

  it("ROI > 90 aber Kosten > 0 -> KEIN HARA-Auto-Approve", () => {
    expect(isHaraAutoApprove({ roiScore: 95, costEur: 5, riskLevel: "LOW" })).toBe(false);
    expect(isHaraAutoApprove({ roiScore: 95, costEur: 0, riskLevel: "HIGH" })).toBe(false);
    expect(isHaraAutoApprove({ roiScore: 90, costEur: 0, riskLevel: "LOW" })).toBe(false);
  });

  it("HARA-Felder mit snake_case werden erkannt", () => {
    expect(isHaraAutoApprove({ roi_score: 91, cost: 0, risk_level: "LOW" })).toBe(true);
  });
});

describe("Einzel-Helfer", () => {
  it("isDestructiveSql erkennt Grant/Revoke, nicht aber INSERT/UPDATE mit Constraint", () => {
    expect(isDestructiveSql("GRANT ALL ON users TO anon;")).toBe(true);
    expect(isDestructiveSql("UPDATE users SET name='x' WHERE id = 1;")).toBe(false);
    expect(isDestructiveSql("INSERT INTO logs (msg) VALUES ('ok');")).toBe(false);
  });

  it("isCriticalSystemCommand greift nicht auf Alltagskommandos", () => {
    expect(isCriticalSystemCommand("npm run build")).toBe(false);
    expect(isCriticalSystemCommand("git status")).toBe(false);
  });

  it("Unbekannte Aktionstypen laufen sicher durch (kein False-Positive-Block)", () => {
    const result = evaluateHITLRisk("memory.saveLearning", { text: "Erkenntnis" });
    expect(result.requiresConfirmation).toBe(false);
    expect(result.category).toBe("unknown");
  });
});
