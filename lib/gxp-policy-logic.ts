export const GXP_POLICY_VERSION = "gxp-guardrails-v1";

export const GXP_CONTROLLED_ACTIONS = [
  "batch_release",
  "deviation_disposition",
  "capa_approval",
  "controlled_document_publish",
  "regulated_record_delete",
  "quality_event_close",
  "electronic_signature",
] as const;

export type GxpControlledAction = typeof GXP_CONTROLLED_ACTIONS[number];

export function evaluateGxpControlledAction(input: {
  action: GxpControlledAction;
  approvalWorkflowVerified: boolean;
  auditStoreAvailable: boolean;
}) {
  if (!input.auditStoreAvailable) {
    return {
      decision: "block" as const,
      executable: false as const,
      reason: "Audit-Speicher nicht verfügbar.",
      policyVersion: GXP_POLICY_VERSION,
    };
  }

  if (!input.approvalWorkflowVerified) {
    return {
      decision: "block" as const,
      executable: false as const,
      reason: "Keine verifizierte menschliche Freigabeinstanz.",
      policyVersion: GXP_POLICY_VERSION,
    };
  }

  // A verified workflow is necessary but not sufficient: this foundation
  // deliberately has no implementation that can authorize execution.
  return {
    decision: "block" as const,
    executable: false as const,
    reason: "Ausführung bleibt deaktiviert, bis die konkrete Aktion serverseitig integriert und validiert ist.",
    policyVersion: GXP_POLICY_VERSION,
  };
}

const GXP_QUALITY_SIGNAL_TERMS = [
  "abweichung", "deviation", "capa", "chargenfehler", "chargenfreigabe",
  "rückruf", "rueckruf", "kontamination", "verunreinigung",
  "datenintegrität", "datenintegritaet", "datenmanipulation",
  "produktmangel", "qualitätsmangel", "qualitaetsmangel",
  "nebenwirkung", "unerwünschte wirkung", "sicherheitsmangel",
];

export function detectGxpQualitySignal(input: { subject?: string; message: string }) {
  const normalized = `${input.subject ?? ""} ${input.message}`.toLocaleLowerCase("de-DE");
  const matchedTerms = GXP_QUALITY_SIGNAL_TERMS.filter((term) => normalized.includes(term));
  return {
    potentialQualityEvent: matchedTerms.length > 0,
    matchedTerms,
    requiresHumanQualityReview: matchedTerms.length > 0,
    automaticDispositionAllowed: false as const,
  };
}
