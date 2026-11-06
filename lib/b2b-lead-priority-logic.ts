/**
 * B2B-Priorisierung: Wer zuerst angerufen wird.
 *
 * Rechnung, die dahinter steht: ein Business-Abschluss (2.499 EUR) entspricht
 * acht Starter-Abschluessen (299 EUR). Wer Anfragen in Eingangsreihenfolge
 * abarbeitet, telefoniert also mit dem falschen Ende der Liste.
 *
 * Was hier NICHT passiert: kein Scoring nach Bauchgefuehl und keine
 * Blackbox. Jedes Merkmal ist sichtbar, jedes Gewicht nachvollziehbar, und
 * fehlende Angaben zaehlen nicht negativ, sondern neutral.
 */
import { isFreeMailDomain } from "./email-logic";

/** Ein Kunde mit Business-Abschluss entspricht so vielen Starter-Kunden. */
export const BUSINESS_TO_STARTER_RATIO = 8;

export type PriorizableLead = {
  id?: string | number;
  company?: string | null;
  email?: string | null;
  domain?: string | null;
  goal?: string | null;
  packageId?: string | null;
  leadScore?: number | null;
  createdAt?: string | Date | null;
};

export type PrioritySignal = {
  id: string;
  label: string;
  points: number;
  detail: string;
};

export type LeadPriority = {
  priorityScore: number;
  band: "hot" | "warm" | "kalt";
  /** Erwarteter Monatsumsatz in Cent, wenn der Kontakt passt. */
  expectedMonthlyCents: number;
  signals: PrioritySignal[];
  /** Warum dieser Rang — in einem Satz, ohne Marketing-Sprache. */
  reason: string;
  recommendedAction: string;
};

/** Woerter, die auf einen Betrieb mit Marketingbudget hindeuten. */
const BUSINESS_GOAL_HINTS = [
  "mitarbeiter",
  "team",
  "filiale",
  "standort",
  "umsatz",
  "marketingbudget",
  "budget",
  "agentur",
  "b2b",
  "vertrieb",
  "leadgenerierung",
  "neukunden",
  "kampagne",
] as const;

/** Freemail heisst nicht automatisch schlecht, aber selten ein Betrieb. */
export function isBusinessDomain(email: string | null | undefined, domain: string | null | undefined): boolean {
  const explicit = (domain ?? "").trim().toLowerCase();
  if (explicit && !isFreeMailDomain(explicit)) return true;
  const mail = (email ?? "").trim().toLowerCase();
  if (!mail.includes("@")) return false;
  const host = mail.split("@")[1] ?? "";
  return Boolean(host) && !isFreeMailDomain(host);
}

function hasCompanyProfile(lead: PriorizableLead): boolean {
  const company = (lead.company ?? "").trim();
  return company.length >= 3;
}

function goalMatchesBusiness(goal: string | null | undefined): string | null {
  const text = (goal ?? "").toLowerCase();
  if (!text) return null;
  const hit = BUSINESS_GOAL_HINTS.find((hint) => text.includes(hint));
  return hit ?? null;
}

/** Bewertet einen Lead. Reihenfolge der Signale = Gewicht. */
export function scoreLeadPriority(lead: PriorizableLead): LeadPriority {
  const signals: PrioritySignal[] = [];
  let score = 0;

  const company = hasCompanyProfile(lead);
  if (company) {
    score += 30;
    signals.push({
      id: "firmenprofil",
      label: "Firmenprofil angegeben",
      points: 30,
      detail: `Unternehmen: ${(lead.company ?? "").trim()}`,
    });
  }

  const businessMail = isBusinessDomain(lead.email, lead.domain);
  if (businessMail) {
    score += 25;
    signals.push({
      id: "geschaeftsdomain",
      label: "Geschaeftsdomain",
      points: 25,
      detail: "Eigene Domain statt Freemail-Adresse",
    });
  }

  const hint = goalMatchesBusiness(lead.goal);
  if (hint) {
    score += 15;
    signals.push({
      id: "budget-hinweis",
      label: "Budget-Hinweis im Anliegen",
      points: 15,
      detail: `Stichwort: ${hint}`,
    });
  }

  const packageId = (lead.packageId ?? "").toLowerCase();
  if (packageId === "business" || packageId === "elite") {
    score += 20;
    signals.push({
      id: "paket-interesse",
      label: "Interesse am Business-Paket",
      points: 20,
      detail: `Paketwunsch: ${packageId}`,
    });
  } else if (packageId === "growth") {
    score += 10;
    signals.push({
      id: "paket-interesse",
      label: "Interesse am Growth-Paket",
      points: 10,
      detail: "Paketwunsch: growth",
    });
  }

  if (company && businessMail) {
    score += 10;
    signals.push({
      id: "betrieb-belegt",
      label: "Betrieb belegt (Firma + Domain)",
      points: 10,
      detail: "Zwei unabhaengige Hinweise auf ein Unternehmen",
    });
  }

  const band: LeadPriority["band"] = score >= 60 ? "hot" : score >= 30 ? "warm" : "kalt";

  const expectedMonthlyCents =
    band === "hot" ? 249_900 : band === "warm" ? 99_900 : 29_900;

  const reason =
    signals.length === 0
      ? "Keine Hinweise auf ein Unternehmen: eher Einzelperson, kein Marketingbudget belegt."
      : `${signals.map((signal) => signal.label).join(" + ")} → ${band}.`;

  const recommendedAction =
    band === "hot"
      ? "Heute anrufen, Termin innerhalb von 48 Stunden anbieten."
      : band === "warm"
        ? "Innerhalb von zwei Werktagen antworten und Erstgespraech anbieten."
        : "Standard-Antwort mit Selbstbedienungs-Checkout, keine Priorisierung.";

  return {
    priorityScore: Math.min(100, score),
    band,
    expectedMonthlyCents,
    signals,
    reason,
    recommendedAction,
  };
}

export type PrioritizedLead = PriorizableLead & LeadPriority & { rank: number };

/**
 * Sortiert Anfragen nach Potenzial.
 *
 * Bei gleichem Score zuerst die neuere Anfrage: ein heisser Lead von gestern
 * ist mehr wert als ein heisser Lead von letzter Woche.
 */
export function prioritizeIntroLeads(leads: readonly PriorizableLead[]): {
  leads: PrioritizedLead[];
  summary: {
    total: number;
    hot: number;
    warm: number;
    kalt: number;
    expectedMonthlyCents: number;
    /** Wie viele Starter-Kunden dieser Bestand an Business-Potenzial entspricht. */
    starterEquivalent: number;
  };
} {
  const scored = leads.map((lead) => ({ lead, priority: scoreLeadPriority(lead) }));
  scored.sort((left, right) => {
    if (right.priority.priorityScore !== left.priority.priorityScore) {
      return right.priority.priorityScore - left.priority.priorityScore;
    }
    const leftTime = left.lead.createdAt ? new Date(left.lead.createdAt).getTime() : 0;
    const rightTime = right.lead.createdAt ? new Date(right.lead.createdAt).getTime() : 0;
    return rightTime - leftTime;
  });

  const prioritized: PrioritizedLead[] = scored.map((entry, index) => ({
    ...entry.lead,
    ...entry.priority,
    rank: index + 1,
  }));

  const hot = prioritized.filter((lead) => lead.band === "hot").length;
  const warm = prioritized.filter((lead) => lead.band === "warm").length;
  const kalt = prioritized.filter((lead) => lead.band === "kalt").length;
  const expectedMonthlyCents = prioritized
    .filter((lead) => lead.band !== "kalt")
    .reduce((sum, lead) => sum + lead.expectedMonthlyCents, 0);

  return {
    leads: prioritized,
    summary: {
      total: prioritized.length,
      hot,
      warm,
      kalt,
      expectedMonthlyCents,
      starterEquivalent: Math.round((hot * BUSINESS_TO_STARTER_RATIO * 100) / 100),
    },
  };
}

/** Warteschlange fuer den Direktvertrieb: nur hot und warm, in dieser Reihenfolge. */
export function outreachQueueFromLeads(leads: readonly PriorizableLead[], limit = 20): PrioritizedLead[] {
  return prioritizeIntroLeads(leads)
    .leads.filter((lead) => lead.band !== "kalt" && Boolean(lead.email))
    .slice(0, Math.max(1, limit));
}
