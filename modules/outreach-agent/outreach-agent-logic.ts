/**
 * Sprint 351 — Saeule 3: Automatisierte Lead-Outreach-Pipeline.
 * Lead-Scoring, Sequenz-Plan (Tag 0/3/7) und ehrliche Grenzen: Das
 * VERSCHICKEN von Outreach-Mails passiert nie autonom — Entwuerfe gehen
 * in die Freigabe-Queue und der Regisseur bestaetigt den Versand.
 */

export type Lead = {
  company: string;
  industry: string;
  employees: number;
  channel: "email" | "linkedin" | "instagram" | "webform";
  painPoint: string;
};

const INDUSTRY_WEIGHT: Record<string, number> = {
  handwerk: 18, "immobilien": 16, ecommerce: 14, saas: 12, content: 12, dienstleistung: 12, vertrieb: 10, unklar: 4,
};

const CHANNEL_WEIGHT: Record<Lead["channel"], number> = { email: 15, linkedin: 14, instagram: 10, webform: 8 };

export type LeadScore = {
  score: number;
  tier: "A" | "B" | "C";
  reasons: string[];
};

export function scoreLead(lead: Lead): LeadScore {
  const reasons: string[] = [];
  const industry = lead.industry.toLowerCase().trim() || "unklar";
  let score = 30;
  const industryWeight = Object.entries(INDUSTRY_WEIGHT).find(([key]) => industry.includes(key))?.[1] ?? 6;
  score += industryWeight;
  reasons.push(`Branche ${industry}: +${industryWeight}`);
  score += CHANNEL_WEIGHT[lead.channel];
  reasons.push(`Kanal ${lead.channel}: +${CHANNEL_WEIGHT[lead.channel]}`);
  if (lead.employees >= 5 && lead.employees <= 200) {
    score += 12;
    reasons.push("Mitarbeiterzahl im sweet spot (5-200): +12");
  }
  if (lead.painPoint.trim().length > 24) {
    score += 10;
    reasons.push("Konkreter Pain Point beschrieben: +10");
  }
  score = Math.max(0, Math.min(100, score));
  const tier = score >= 75 ? "A" : score >= 55 ? "B" : "C";
  return { score, tier, reasons };
}

export function rankLeads(leads: readonly Lead[]): { lead: Lead; score: LeadScore }[] {
  return leads
    .map((lead) => ({ lead, score: scoreLead(lead) }))
    .sort((a, b) => b.score.score - a.score.score);
}

export type OutreachStep = {
  day: number;
  channel: Lead["channel"];
  script: string;
};

export function buildOutreachScript(lead: Lead, product: string): string {
  const pain = lead.painPoint.trim() || "derzeitige manuelle Prozesse";
  return [
    `Betreff: ${pain.slice(0, 60)} — 2-Minuten-Idee fuer ${lead.company}`,
    "",
    `Hallo ${lead.company}-Team,`,
    `ich habe gesehen, dass ${pain} bei euch viel Zeit frisst. Wir haben mit ${product} genau das fuer ${lead.industry.trim() || "eure Branche"} automatisiert.`,
    "Wenn das fuer euch relevant ist, schicke ich gern eine 2-Minuten-Demo — sonst wuensche ich weiterhin guten Fliess!",
  ].join("\n");
}

export type OutreachSequence = {
  lead: Lead;
  score: LeadScore;
  steps: readonly OutreachStep[];
  approvalRequired: boolean;
};

/** Sequenz Tag 0/3/7 — jeder Schritt wartet auf die Freigabe des Regisseurs. */
export function buildOutreachSequence(lead: Lead, product: string): OutreachSequence {
  const score = scoreLead(lead);
  const first = buildOutreachScript(lead, product);
  const steps: OutreachStep[] = [
    { day: 0, channel: lead.channel, script: first },
    { day: 3, channel: lead.channel, script: `Kurzer Nachfass zu meiner Idee fuer ${lead.company} — nur 2 Minuten Lesezeit, danach lasse ich dich in Ruhe.` },
    { day: 7, channel: lead.channel, script: `Letzter Kontakt: Falls ${lead.painPoint.trim() || "das Thema"} aktuell keine Prioritaet hat, alles gut — ich schliesse den Thread damit und wuensche Erfolg.` },
  ];
  return { lead, score, steps, approvalRequired: true };
}
