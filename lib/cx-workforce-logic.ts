export type CxCategory =
  | "billing"
  | "refund"
  | "technical"
  | "account"
  | "product"
  | "security"
  | "complaint"
  | "general";

export type CxPriority = "critical" | "high" | "normal" | "low";
export type CxQueue = "security" | "billing-specialist" | "technical-support" | "customer-success" | "general-support";

export interface CxTriageInput {
  subject?: string;
  message: string;
  productInterest?: string;
  purchaseIntent?: string;
}

export interface CxTriageResult {
  category: CxCategory;
  priority: CxPriority;
  confidence: number;
  queue: CxQueue;
  ticketStage: "1" | "3";
  humanReviewRequired: boolean;
  escalationReasons: string[];
  responseDraft: string;
  automationMode: "draft_only";
  classifier: "deterministic_rules_v1";
}

const RULES: Array<{ category: CxCategory; terms: string[] }> = [
  { category: "security", terms: ["gehackt", "hacked", "datenleck", "data breach", "phishing", "kontoübernahme", "account takeover", "unbefugter zugriff", "security incident"] },
  { category: "refund", terms: ["rückerstattung", "refund", "geld zurück", "widerruf", "chargeback", "erstattung"] },
  { category: "billing", terms: ["rechnung", "zahlung", "bezahlt", "billing", "invoice", "abbuchung", "doppelt belastet", "stripe"] },
  { category: "technical", terms: ["fehler", "bug", "funktioniert nicht", "funktioniert nicht mehr", "error", "crash", "absturz", " lädt nicht", "login schlägt fehl", "api"] },
  { category: "account", terms: ["anmelden", "login", "passwort", "zugang", "konto", "account", "verifizieren"] },
  { category: "complaint", terms: ["beschwerde", "unzufrieden", "enttäuscht", "kündigen", "inakzeptabel", "schlechter service", "complaint"] },
  { category: "product", terms: ["produkt", "revenue os", "content studio", "villaforge", "ai influenza", "preis", "tarif", "funktion", "feature"] },
];

const ESCALATION_TERMS = [
  "anwalt", "rechtliche schritte", "polizei", "betrug", "fraud", "datenleck",
  "gehackt", "hacked", "daten gelöscht", "datenverlust", "chargeback",
  "kündigen", "beschwerde", "rückerstattung", "refund", "sicherheitsvorfall",
];

function includesAny(text: string, terms: string[]): string[] {
  return terms.filter((term) => text.includes(term));
}

function responseFor(category: CxCategory): string {
  const opening = "Vielen Dank für deine Nachricht. Wir haben dein Anliegen erhalten und prüfen es.";
  const next: Record<CxCategory, string> = {
    security: "Aus Sicherheitsgründen übernimmt ein zuständiges Teammitglied die Prüfung. Bitte sende keine Passwörter oder vollständigen Zahlungsdaten.",
    refund: "Deine Anfrage zur Erstattung wird von unserem Support-Team geprüft. Eine Erstattung oder Frist wird hiermit noch nicht zugesagt.",
    billing: "Wir gleichen die Zahlungs- und Rechnungsinformationen ab. Bitte teile keine vollständigen Karten- oder Kontodaten mit.",
    technical: "Wir prüfen die technische Störung. Hilfreich sind Produktbereich, Zeitpunkt und eine kurze Beschreibung der letzten Schritte; bitte keine Zugangsdaten senden.",
    account: "Wir helfen dir beim Kontozugang. Bitte übermittle niemals dein Passwort oder Einmal-Codes.",
    product: "Wir ordnen deine Frage dem passenden Produktteam zu und melden uns mit bestätigten Informationen.",
    complaint: "Wir nehmen dein Feedback ernst und lassen den Vorgang persönlich prüfen.",
    general: "Wir leiten dein Anliegen an das passende Support-Team weiter und melden uns mit den nächsten Schritten.",
  };
  return `${opening}\n\n${next[category]}\n\nViele Grüße\nCyberSarah Support`;
}

export function triageCxRequest(input: CxTriageInput): CxTriageResult {
  const message = String(input.message ?? "").trim();
  const subject = String(input.subject ?? "").trim();
  if (message.length < 3 || message.length > 12000) {
    throw new Error("Die Supportnachricht muss zwischen 3 und 12.000 Zeichen enthalten.");
  }
  const text = `${subject} ${message}`.toLocaleLowerCase("de-DE");
  const hits = RULES.map((rule) => ({ category: rule.category, matches: includesAny(text, rule.terms) }))
    .filter((rule) => rule.matches.length > 0)
    .sort((a, b) => b.matches.length - a.matches.length);
  const category = hits[0]?.category ?? "general";
  const matched = hits[0]?.matches.length ?? 0;
  const confidence = category === "general" ? 0.35 : Math.min(0.95, 0.55 + matched * 0.12);
  const escalationReasons = includesAny(text, ESCALATION_TERMS);
  const security = category === "security";
  const sensitive = security || category === "refund" || category === "complaint" || escalationReasons.length > 0;
  const priority: CxPriority = security ? "critical"
    : sensitive || category === "technical" ? "high"
    : category === "general" ? "normal" : "normal";
  const queue: CxQueue = security ? "security"
    : category === "billing" || category === "refund" ? "billing-specialist"
    : category === "technical" ? "technical-support"
    : category === "product" || category === "complaint" ? "customer-success"
    : "general-support";
  return {
    category,
    priority,
    confidence: Math.round(confidence * 100) / 100,
    queue,
    ticketStage: "1",
    humanReviewRequired: sensitive || confidence < 0.6,
    escalationReasons: [...new Set(escalationReasons)],
    responseDraft: responseFor(category),
    automationMode: "draft_only",
    classifier: "deterministic_rules_v1",
  };
}
