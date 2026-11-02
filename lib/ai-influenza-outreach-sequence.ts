/**
 * Ansprache-Sequenz fuer das AI Influenza Team.
 *
 * Diese Texte sind die einzige Stelle, an der Kaltakquise formuliert wird.
 * Deshalb gelten hier harte Regeln, die der Validator auch prueft:
 * - jede Mail nennt einen konkreten Befund statt einer Behauptung,
 * - jede Mail traegt einen Abmelde-Platzhalter,
 * - keine Erfolgsversprechen (kein "garantiert", "100 %", "Umsatzgarantie"),
 * - kurze Saetze, keine Textwaende: mehr als 900 Zeichen gehen nicht raus.
 *
 * Es wird nichts automatisch versendet. Die Sequenz liefert nur den Text;
 * Versand, Tageslimit und Doppelschutz liegen im Mail-Dienst.
 */

export type OutreachStepId = "erstkontakt" | "befund" | "abschluss";

export type OutreachStep = {
  id: OutreachStepId;
  /** Tage nach dem Erstkontakt, an dem dieser Schritt faellig ist. */
  dayOffset: number;
  subject: string;
  body: string;
};

/** Platzhalter, die vor dem Versand gefuellt sein muessen. */
export const OUTREACH_PLACEHOLDERS = [
  "vorname",
  "firma",
  "befund",
  "absender",
  "abmelde_link",
] as const;

export type OutreachPlaceholder = (typeof OUTREACH_PLACEHOLDERS)[number];

/** Muss in jeder einzelnen Mail stehen: Anrede, Absender, Ausstieg. */
export const PLACEHOLDERS_PER_MAIL: readonly OutreachPlaceholder[] = ["vorname", "absender", "abmelde_link"];

/** Muss irgendwo in der Sequenz vorkommen: Bezug zur Firma und ein Befund. */
export const PLACEHOLDERS_IN_SEQUENCE: readonly OutreachPlaceholder[] = ["firma", "befund"];

export const OUTREACH_BODY_MAX_CHARS = 900;

/** Worte, die ein Versprechen behaupten, das niemand halten kann. */
export const FORBIDDEN_PROMISES = [
  "garantiert",
  "umsatzgarantie",
  "100 %",
  "100%",
  "reich werden",
  "sicher mehr umsatz",
  "verdoppel",
] as const;

export const AI_INFLUENZA_OUTREACH_SEQUENCE: readonly OutreachStep[] = [
  {
    id: "erstkontakt",
    dayOffset: 0,
    subject: "{{firma}}: eine Beobachtung zu eurem Content",
    body: [
      "Hallo {{vorname}},",
      "",
      "{{befund}}",
      "",
      "Ich baue mit einem kleinen KI-Team genau das, was danach fehlt: Marktanalyse,",
      "Content, Video und Reporting laufen im Tageszyklus, jeder Schritt mit Zeitstempel",
      "und Kosten im Dashboard nachvollziehbar.",
      "",
      "Wenn du willst, schicke ich dir die Analyse zu {{firma}} als PDF, ohne Verpflichtung.",
      "Antworte einfach mit \"ja\", dann ist sie in zwei Werktagen da.",
      "",
      "Viele Gruesse",
      "{{absender}}",
      "",
      "Kein Interesse? Hier abmelden: {{abmelde_link}}",
    ].join("\n"),
  },
  {
    id: "befund",
    dayOffset: 4,
    subject: "Nachtrag zu {{firma}}",
    body: [
      "Hallo {{vorname}},",
      "",
      "kurzer Nachtrag, kein Werbeblock: {{befund}}",
      "",
      "Der Punkt, an dem es bei den meisten scheitert, ist nicht die Idee, sondern die",
      "Auslieferung. Zwei Videos pro Woche klingen wenig, bis eine Woche krank wird.",
      "Deshalb laeuft bei mir alles als Auftrag mit Status, damit man sieht, was haengt.",
      "",
      "Falls das nicht auf deiner Liste steht: sag es kurz, dann hoere ich auf.",
      "",
      "Viele Gruesse",
      "{{absender}}",
      "",
      "Abmelden: {{abmelde_link}}",
    ].join("\n"),
  },
  {
    id: "abschluss",
    dayOffset: 11,
    subject: "Letzte Nachricht von mir, {{vorname}}",
    body: [
      "Hallo {{vorname}},",
      "",
      "ich mache es kurz und hoere danach auf: Wenn Content bei {{firma}} gerade",
      "kein Thema ist, ist das eine voellig legitime Antwort.",
      "",
      "Falls doch, reicht ein Wort. Ich melde mich dann nicht wieder ungefragt.",
      "",
      "Viele Gruesse",
      "{{absender}}",
      "",
      "Abmelden: {{abmelde_link}}",
    ].join("\n"),
  },
];

/** Prueft die Sequenz gegen die Regeln oben; leer heisst: versandfaehig. */
export function validateOutreachSequence(
  sequence: readonly OutreachStep[] = AI_INFLUENZA_OUTREACH_SEQUENCE,
): string[] {
  const issues: string[] = [];
  if (sequence.length === 0) return ["Die Sequenz ist leer."];
  let previousOffset = -1;
  for (const step of sequence) {
    const where = step.id;
    if (step.dayOffset <= previousOffset) issues.push(`${where}: dayOffset muss aufsteigend sein.`);
    previousOffset = step.dayOffset;
    if (!step.subject.trim()) issues.push(`${where}: Betreff fehlt.`);
    if (step.body.length > OUTREACH_BODY_MAX_CHARS)
      issues.push(`${where}: Text zu lang (${step.body.length} > ${OUTREACH_BODY_MAX_CHARS}).`);
    for (const placeholder of PLACEHOLDERS_PER_MAIL) {
      if (!step.body.includes(`{{${placeholder}}}`))
        issues.push(`${where}: Platzhalter {{${placeholder}}} fehlt.`);
    }
    const lower = `${step.subject} ${step.body}`.toLowerCase();
    for (const promise of FORBIDDEN_PROMISES) {
      if (lower.includes(promise)) issues.push(`${where}: verbotenes Versprechen "${promise}".`);
    }
  }
  const allText = sequence.map((step) => `${step.subject} ${step.body}`).join(" ");
  for (const placeholder of PLACEHOLDERS_IN_SEQUENCE) {
    if (!allText.includes(`{{${placeholder}}}`))
      issues.push(`Sequenz: Platzhalter {{${placeholder}}} kommt nirgends vor.`);
  }
  return issues;
}

/** Fuellt die Platzhalter. Fehlt ein Wert, bleibt der Platzhalter stehen. */
export function renderOutreachStep(
  step: OutreachStep,
  values: Partial<Record<OutreachPlaceholder, string>>,
): { subject: string; body: string; missing: OutreachPlaceholder[] } {
  const missing: OutreachPlaceholder[] = [];
  let subject = step.subject;
  let body = step.body;
  for (const placeholder of OUTREACH_PLACEHOLDERS) {
    const raw = values[placeholder]?.trim();
    if (!raw) {
      missing.push(placeholder);
      continue;
    }
    const token = `{{${placeholder}}}`;
    subject = subject.split(token).join(raw);
    body = body.split(token).join(raw);
  }
  return { subject, body, missing };
}

/** Naechster Schritt nach dem heutigen Tag; null heisst: Sequenz ist durch. */
export function nextOutreachStep(
  daysSinceFirstContact: number,
  sequence: readonly OutreachStep[] = AI_INFLUENZA_OUTREACH_SEQUENCE,
): OutreachStep | null {
  if (!Number.isFinite(daysSinceFirstContact) || daysSinceFirstContact < 0) return null;
  const pending = sequence.filter((step) => step.dayOffset <= daysSinceFirstContact);
  return pending.length > 0 ? pending[pending.length - 1] : null;
}
