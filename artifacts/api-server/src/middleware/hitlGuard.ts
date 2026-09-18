/**
 * CyberSarah Control Center — Human-in-the-Loop (HITL) Guardrail
 *
 * Bewertet geplante Agent-Aktionen vor der Ausfuehrung:
 * - Geldtransfers (Auszahlung / Ad-Spend) oberhalb des Schwellenwerts
 * - Destruktive SQL-Statements (DROP TABLE, TRUNCATE, ...)
 * - Kritische System Calls (sudo, reboot, shutdown, ...)
 *
 * Rueckgabe: AUTO_APPROVED (direkte Ausfuehrung erlaubt) oder
 * OPERATOR_CONFIRM_REQUIRED (HITL-Stopp bis zur Bestaetigung).
 */

export type HITLStatus = "AUTO_APPROVED" | "OPERATOR_CONFIRM_REQUIRED";

export interface HITLRiskAssessment {
  requiresConfirmation: boolean;
  status: HITLStatus;
  reason: string;
}

/** Betrag in EUR, ab dem Transaktionen immer eine HITL-Bestaetigung brauchen. */
export const HIGH_RISK_TRANSACTION_THRESHOLD_EUR = 50;

/** Destruktive oder datenveraendernde SQL-Statements. */
const DESTRUCTIVE_SQL_PATTERN =
  /\b(drop\s+table|drop\s+database|drop\s+schema|truncate|delete\s+from|insert\s+into|update\s+\w+\s+set|alter\s+table|grant\s+|revoke\s+)\b/i;

/** Kritische System-Kommandos, die niemals automatisch laufen duerfen. */
const CRITICAL_COMMAND_PATTERN =
  /(^|\s)(sudo|su\s|reboot|shutdown|halt|poweroff|init\s+[06]|rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)|mkfs|dd\s+if=|systemctl\s+(reboot|poweroff|halt)|killall)\b/i;

function autoApproved(reason: string): HITLRiskAssessment {
  return { requiresConfirmation: false, status: "AUTO_APPROVED", reason };
}

function operatorConfirmationRequired(reason: string): HITLRiskAssessment {
  return { requiresConfirmation: true, status: "OPERATOR_CONFIRM_REQUIRED", reason };
}

export function evaluateHITLRisk(
  action: string,
  payload: Record<string, unknown>
): HITLRiskAssessment {
  const normalizedAction = (action ?? "").trim().toLowerCase();

  // --- 1) Geldtransfers: Auszahlung / Ad-Spend / Payout ---
  if (
    normalizedAction.includes("auszahlung") ||
    normalizedAction.includes("ad-spend") ||
    normalizedAction.includes("ad spend") ||
    normalizedAction.includes("payout") ||
    normalizedAction.includes("transaktion")
  ) {
    const amount = Number(payload?.amount ?? 0);
    if (Number.isFinite(amount) && amount > HIGH_RISK_TRANSACTION_THRESHOLD_EUR) {
      return operatorConfirmationRequired(
        `Transaktion von ${amount.toFixed(2)} EUR ueberschreitet das Limit von ` +
          `${HIGH_RISK_TRANSACTION_THRESHOLD_EUR.toFixed(2)} EUR.`
      );
    }
    return autoApproved(
      `Transaktion von ${(Number.isFinite(amount) ? amount : 0).toFixed(2)} EUR liegt unter dem ` +
        `${HIGH_RISK_TRANSACTION_THRESHOLD_EUR.toFixed(2)} EUR-Limit.`
    );
  }

  // --- 2) Datenbank-Queries ---
  if (
    normalizedAction.includes("database") ||
    normalizedAction.includes("sql") ||
    normalizedAction.includes("query")
  ) {
    const query = String(payload?.query ?? "");
    if (DESTRUCTIVE_SQL_PATTERN.test(query)) {
      return operatorConfirmationRequired(
        "Destruktives SQL-Statement erkannt — Datenverlust moeglich."
      );
    }
    return autoApproved("Sichere Lese-Abfrage — keine schreibenden Operationen erkannt.");
  }

  // --- 3) System Calls / Shell-Kommandos ---
  if (
    normalizedAction.includes("system") ||
    normalizedAction.includes("shell") ||
    normalizedAction.includes("command") ||
    normalizedAction.includes("call") ||
    normalizedAction.includes("exec")
  ) {
    const command = String(payload?.command ?? "");
    if (CRITICAL_COMMAND_PATTERN.test(command)) {
      return operatorConfirmationRequired(
        "Kritisches System-Kommando erkannt — Infrastruktur-Gefährdung."
      );
    }
    return autoApproved("Unkritisches System-Kommando.");
  }

  // --- 4) Unbekannte Aktionstypen: standardmaessig sicher durchlassen ---
  return autoApproved("Aktionstyp ohne definiertes Hochrisiko-Profil.");
}
