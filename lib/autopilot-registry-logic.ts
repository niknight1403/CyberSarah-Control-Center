/**
 * Autopilot-Registry: welche Automatik gibt es, in welcher Kadenz, was darf
 * sie schreiben und wo ist sie bewusst NICHT sinnvoll.
 *
 * Der Nutzen ist Ehrlichkeit gegenueber dem Betrieb: ein Autopilot ohne
 * Reichweite, ohne externes Signal oder ohne Freigabe-Gate ist kein
 * Autopilot, sondern ein Risiko. Diese Datei macht die Entscheidung sichtbar
 * statt sie zu implizieren.
 *
 * Sie beschreibt den Code-Stand. Sie liest nichts zur Laufzeit — was hier
 * `active` ist, laeuft auch wirklich (Cron, Workflow oder Aufruf im
 * Control-Center-Autopilot).
 */
export type AutopilotStatus = "active" | "recommended" | "not-useful";

export type AutopilotEntry = {
  id: string;
  label: string;
  /** Wann der Lauf stattfindet. */
  cadence: string;
  /** Was er tatsaechlich veraendert. */
  writes: string;
  /** Was ihn bremst oder absichert. */
  gates: string[];
  status: AutopilotStatus;
  /** Warum genau dieser Lauf sinnvoll (oder eben nicht) ist. */
  rationale: string;
};

export const AUTOPILOTS: readonly AutopilotEntry[] = [
  {
    id: "control-center",
    label: "Control-Center-Autopilot (Dachlauf)",
    cadence: "alle 2 Stunden (GitHub-Cron) + nach jedem Deploy",
    writes: "Revenue-Scans, Optimierungs-Experimente, Entwuerfe, Growth-Schritte",
    gates: ["METRICS_TOKEN", "Freigabe fuer Veroeffentlichung", "Preis-/Geldaktionen ausgeschlossen"],
    status: "active",
    rationale: "Ein Lauf buendelt alle Schritte, damit Signale gemeinsam bewertet werden statt in Einzelteilen.",
  },
  {
    id: "hub-drafts",
    label: "Hub-Entwuerfe (Loop-Abdeckung)",
    cadence: "im Dachlauf, alle 2 Stunden",
    writes: "pending-Entwuerfe fuer die vier Loop-Stufen je Bereich + Loop-Engineering-Entwurf",
    gates: ["Queue-Limits", "Wochen-Dedupe", "Freigabe vor Veroeffentlichung"],
    status: "active",
    rationale: "Ohne Nachschub verhungert jeder Loop; die Rotation verhindert, dass die Queue volllaeuft.",
  },
  {
    id: "revenue-discovery",
    label: "Umsatz-Discovery",
    cadence: "im Dachlauf, alle 2 Stunden",
    writes: "Ideen-Entwuerfe fuer neue oder integrierbare Umsatzwege",
    gates: ["nur belegte Signale", "max. 4 Entwuerfe je Lauf", "Wochen-Dedupe", "Freigabe"],
    status: "active",
    rationale: "Sucht dort, wo Daten existieren (Katalog, Angebotsluecken, rote Integrationen) statt zu raten.",
  },
  {
    id: "outreach",
    label: "Outreach-Worker",
    cadence: "nach Anlass, nicht im Takt",
    writes: "Erstansprachen — nur mit aktiver Freigabe",
    gates: ["OUTREACH_LIVE=1", "Unsubscribe-URL", "Trockenlauf als Default"],
    status: "active",
    rationale: "Sinnvoll nur oberhalb einer Mindestqualitaet der Kontakte; darunter erzeugt es Imageschaden.",
  },
  {
    id: "publishing",
    label: "Publishing-Autopilot",
    cadence: "im Dachlauf",
    writes: "Veroeffentlichung freigegebener Bausteine",
    gates: ["Freigabe", "Plattform-Credentials", "Sandbox-Fallback ohne Credentials"],
    status: "active",
    rationale: "Verteilung ist der langsamste Teil des Loops — hier zahlt Automatik direkt.",
  },
  {
    id: "integration-health",
    label: "Integrations-Health",
    cadence: "auf Abruf (Admin/UI), 5-Minuten-Cache",
    writes: "nichts — nur lesende Pruefung",
    gates: ["protectedProcedure", "Cache gegen Quota-Verbrauch"],
    status: "recommended",
    rationale: "Ein 30-Minuten-Cron waere sinnvoll, sobald Alarme ankommen: heute fehlt der Alarmkanal, ein Cron ohne Empfaenger ist Rauschen.",
  },
  {
    id: "price-tuning",
    label: "Automatische Preisoptimierung",
    cadence: "keine — bewusst nicht gebaut",
    writes: "Preise an echten Produkten",
    gates: ["nicht gebaut"],
    status: "not-useful",
    rationale: "Zu wenig Daten pro Preisstufe: eine Automatik wuerde aus Rauschen Preise aendern. Erst Messvolumen, dann Automatik.",
  },
  {
    id: "marketplace-scan",
    label: "Marktplatz-DauerScan",
    cadence: "keine — wartet auf Plattform-API",
    writes: "Kandidaten aus externen Katalogen",
    gates: ["Plattform-API mit Provisionsdaten"],
    status: "recommended",
    rationale: "Sinnvoll, sobald die API Provisions- und Verkaufsdaten liefert; ohne diese Zahlen waere die Bewertung geraten.",
  },
];

export type AutopilotOverview = {
  autopilots: AutopilotEntry[];
  summary: { active: number; recommended: number; notUseful: number };
  /** Klartext-Empfehlung fuer den naechsten Ausbauschritt. */
  nextSensibleStep: string;
};

export function buildAutopilotOverview(entries: readonly AutopilotEntry[] = AUTOPILOTS): AutopilotOverview {
  const active = entries.filter((entry) => entry.status === "active");
  const recommended = entries.filter((entry) => entry.status === "recommended");
  const notUseful = entries.filter((entry) => entry.status === "not-useful");
  const next = recommended[0];
  return {
    autopilots: [...entries],
    summary: { active: active.length, recommended: recommended.length, notUseful: notUseful.length },
    nextSensibleStep: next
      ? `${next.label}: ${next.rationale}`
      : "Alle sinnvollen Laeufe sind aktiv; naechster Schritt ist Messvolumen, nicht mehr Automatik.",
  };
}

/** Filtert nach Status — damit die UI nicht selbst sortieren muss. */
export function autopilotsByStatus(status: AutopilotStatus, entries: readonly AutopilotEntry[] = AUTOPILOTS): AutopilotEntry[] {
  return entries.filter((entry) => entry.status === status);
}
