/**
 * Human-in-the-Loop (HITL) Guardrail-Logik (Sprint 161) — rein und testbar.
 *
 * Bewertet geplante Agenten-/Tool-Aktionen VOR der Ausfuehrung und entscheidet,
 * ob sie vollautonom durchlaufen (AUTO_APPROVED) oder erst durch den Operator
 * bestaetigt werden muessen (OPERATOR_CONFIRM_REQUIRED).
 *
 * Hochrisiko-Regeln (Master-Prompt V4.0, Abschnitt 5):
 *   1. Transaktionen / Ad-Budget / Auszahlungen > 50,00 EUR
 *   2. Destruktive SQL-Befehle (DROP, TRUNCATE, DELETE ohne ID-Constraint)
 *   3. Server-Reboots, SSH-Key-Aenderungen, System-Flashes, kritische Shell-Kommandos
 *   4. Massen-E-Mails an > 500 Empfaenger
 *
 * HARA-Auto-Approve: Bei ROI_Score > 90, Kosten = 0,00 EUR und RiskLevel = LOW
 * wird die Ausfuehrung vollautonom freigegeben (keine Operator-Intervention).
 *
 * Die Logik ist bewusst frei von Framework-Abhaengigkeiten: Der Orchestrator
 * (server/orchestrator/tool-registry.ts) ruft sie als zusaetzliche Safety-
 * Schicht vor jedem Tool-Aufruf auf; sie ist identisch in Vitest testbar.
 */

export type HITLStatus = "AUTO_APPROVED" | "OPERATOR_CONFIRM_REQUIRED";

export type HITLCategory = "hara" | "transaction" | "database" | "system" | "email" | "unknown";

export interface HITLRiskAssessment {
  requiresConfirmation: boolean;
  status: HITLStatus;
  reason: string;
  /** Welche Regel das Ergebnis bestimmt hat (Diagnose/Audit). */
  category: HITLCategory;
}

/** Betrag in EUR, ab dem Transaktionen immer eine HITL-Bestaetigung brauchen. */
export const HIGH_RISK_TRANSACTION_THRESHOLD_EUR = 50;

/** Empfaengerzahl, ab der Massen-E-Mails immer eine HITL-Bestaetigung brauchen. */
export const MASS_EMAIL_RECIPIENT_THRESHOLD = 500;

/** ROI-Score, ab dem (bei Kosten 0 EUR und RiskLevel LOW) HARA-Auto-Approve greift. */
export const HARA_AUTO_APPROVE_ROI_THRESHOLD = 90;

/**
 * Destruktive SQL-Schluesselwoerter. DELETE FROM wird separat behandelt:
 * nur wenn KEIN sicherer ID-Constraint vorliegt, gilt es als destruktiv.
 */
const DESTRUCTIVE_SQL_PATTERN =
  /\b(drop\s+table|drop\s+database|drop\s+schema|drop\s+index|truncate|alter\s+table|grant\s+|revoke\s+)\b/i;

/** DELETE FROM mit WHERE ... id = ... Constraint gilt als begrenzt-sicher. */
const SAFE_DELETE_CONSTRAINT_PATTERN = /\bwhere\b[\s\S]*\bid\s*=\s*\S+/i;

/** Kritische System-Kommandos, die niemals automatisch laufen duerfen. */
const CRITICAL_COMMAND_PATTERN =
  /(^|[\s;|&])(sudo|su\s|reboot|shutdown|halt|poweroff|init\s+[06]|mkfs|dd\s+if=|systemctl\s+(reboot|poweroff|halt)|killall|chmod\s+[0-7]{3,4}\s+~\/\.ssh|ssh-keygen|flash\s+(all|image)|fastboot\s+(flash|oem))\b/i;

/** SSH-Key-/Zugriffs-Manipulationen im Befehlstext. */
const SSH_KEY_COMMAND_PATTERN = /(authorized_keys|\.ssh\/id_(rsa|ed25519)|authorized_keys|passwd\s|shadow\b)/i;

/** System-Flash-/Provisionierungs-Hinweise im Befehlstext. */
const SYSTEM_FLASH_COMMAND_PATTERN = /\b(flash|reflash|sysupgrade|fw_update|ota-update)\b.*\b(image|system|router|device)\b/i;

function autoApproved(reason: string, category: HITLCategory = "unknown"): HITLRiskAssessment {
  return { requiresConfirmation: false, status: "AUTO_APPROVED", reason, category };
}

function operatorConfirmationRequired(reason: string, category: HITLCategory): HITLRiskAssessment {
  return { requiresConfirmation: true, status: "OPERATOR_CONFIRM_REQUIRED", reason, category };
}

/** Liest einen numerischen Payload-Wert unabhaengig vom Feldnamen (amount/cost/value). */
function readAmount(payload: Record<string, unknown>): number {
  const raw = payload?.amount ?? payload?.costEur ?? payload?.value ?? 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Liest die Empfaengerzahl (recipients/recipientCount/recipient_count). */
function readRecipientCount(payload: Record<string, unknown>): number {
  const raw = payload?.recipients ?? payload?.recipientCount ?? payload?.recipient_count ?? 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Prueft, ob ein SQL-Statement destruktiv ist (DELETE nur ohne ID-Constraint). */
export function isDestructiveSql(query: string): boolean {
  const statement = query ?? "";
  if (DESTRUCTIVE_SQL_PATTERN.test(statement)) return true;
  if (/\bdelete\s+from\b/i.test(statement)) {
    return !SAFE_DELETE_CONSTRAINT_PATTERN.test(statement);
  }
  return false;
}

/** Prueft, ob ein Shell-Kommando kritisch ist (Reboot/SSH-Keys/System-Flash). */
export function isCriticalSystemCommand(command: string): boolean {
  const cmd = command ?? "";
  return (
    CRITICAL_COMMAND_PATTERN.test(cmd) ||
    SSH_KEY_COMMAND_PATTERN.test(cmd) ||
    SYSTEM_FLASH_COMMAND_PATTERN.test(cmd)
  );
}

/** HARA-Auto-Approve: ROI > 90 UND Kosten exakt 0,00 EUR UND RiskLevel LOW. */
export function isHaraAutoApprove(payload: Record<string, unknown>): boolean {
  const roi = Number(payload?.roiScore ?? payload?.roi_score ?? Number.NaN);
  const cost = Number(payload?.costEur ?? payload?.cost ?? Number.NaN);
  const riskLevel = String(payload?.riskLevel ?? payload?.risk_level ?? "").trim().toUpperCase();

  return Number.isFinite(roi) && roi > HARA_AUTO_APPROVE_ROI_THRESHOLD && cost === 0 && riskLevel === "LOW";
}

/**
 * Bewertet eine geplante Aktion. `action` ist der Aktionstyp bzw. Tool-Name,
 * `payload` die strukturierten Aufrufparameter.
 */
export function evaluateHITLRisk(
  action: string,
  payload: Record<string, unknown>
): HITLRiskAssessment {
  const normalizedAction = (action ?? "").trim().toLowerCase();

  // --- 0) HARA-Auto-Approve (ROI > 90, Kosten 0,00 EUR, RiskLevel LOW) ---
  if (isHaraAutoApprove(payload)) {
    return autoApproved(
      `HARA-Auto-Approve: ROI ${String(payload.roiScore ?? payload.roi_score)} > ${HARA_AUTO_APPROVE_ROI_THRESHOLD}, ` +
        `Kosten 0,00 EUR, RiskLevel LOW — vollautonome Ausfuehrung freigegeben.`,
      "hara"
    );
  }

  // --- 1) Geldtransfers: Auszahlung / Ad-Spend / Payout / Budget ---
  if (
    /auszahlung|ad[- ]?spend|payout|transaktion|transaction|budget|ausgabe/.test(normalizedAction)
  ) {
    const amount = readAmount(payload);
    if (amount > HIGH_RISK_TRANSACTION_THRESHOLD_EUR) {
      return operatorConfirmationRequired(
        `Transaktion von ${amount.toFixed(2)} EUR ueberschreitet das Limit von ` +
          `${HIGH_RISK_TRANSACTION_THRESHOLD_EUR.toFixed(2)} EUR.`,
        "transaction"
      );
    }
    return autoApproved(
      `Transaktion von ${amount.toFixed(2)} EUR liegt unter dem ` +
        `${HIGH_RISK_TRANSACTION_THRESHOLD_EUR.toFixed(2)} EUR-Limit.`,
      "transaction"
    );
  }

  // --- 2) Datenbank-Queries ---
  if (/database|sql|query|db\./.test(normalizedAction)) {
    const query = String(payload?.query ?? payload?.sql ?? "");
    if (isDestructiveSql(query)) {
      return operatorConfirmationRequired(
        "Destruktives SQL-Statement erkannt — Datenverlust moeglich.",
        "database"
      );
    }
    return autoApproved("Sichere Lese-Abfrage — keine unbeschraenkten Schreiboperationen.", "database");
  }

  // --- 3) System Calls / Shell / Reboots / SSH-Keys / Flashes ---
  if (
    /system|shell|command|call|exec|reboot|restart|shutdown|flash|server/.test(normalizedAction) ||
    typeof payload?.command === "string"
  ) {
    const command = String(payload?.command ?? "");
    if (isCriticalSystemCommand(command)) {
      return operatorConfirmationRequired(
        "Kritisches System-Kommando erkannt — Infrastruktur-Gefaehrdung.",
        "system"
      );
    }
    return autoApproved("Unkritisches System-Kommando.", "system");
  }

  // --- 4) Massen-E-Mails ---
  if (/e-?mail|mail|newsletter|broadcast/.test(normalizedAction)) {
    const recipients = readRecipientCount(payload);
    if (recipients > MASS_EMAIL_RECIPIENT_THRESHOLD) {
      return operatorConfirmationRequired(
        `Massen-E-Mail an ${recipients} Empfaenger ueberschreitet das Limit von ` +
          `${MASS_EMAIL_RECIPIENT_THRESHOLD} Empfaengern.`,
        "email"
      );
    }
    return autoApproved(
      `E-Mail an ${recipients} Empfaenger liegt unter dem ${MASS_EMAIL_RECIPIENT_THRESHOLD}-Empfaenger-Limit.`,
      "email"
    );
  }

  // --- 5) Unbekannte Aktionstypen: standardmaessig sicher durchlassen ---
  return autoApproved("Aktionstyp ohne definiertes Hochrisiko-Profil.");
}
