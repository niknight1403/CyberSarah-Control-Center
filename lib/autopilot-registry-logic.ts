/**
 * Autopilot-Katalog: welche Automatik gibt es, wodurch wird sie ausgeloest,
 * was darf sie schreiben und wo ist sie bewusst NICHT sinnvoll.
 *
 * Finalisiert heisst hier: jeder Eintrag traegt seine Verdrahtung mit
 * (`trigger.ref`). Der Katalog behauptet damit nichts, was sich nicht pruefen
 * laesst — `tests/autopilot-catalog-wiring.test.ts` vergleicht jede Referenz
 * mit dem echten Workflow, Timer oder Endpunkt im Repo. Ein Autopilot ohne
 * Reichweite, ohne externes Signal oder ohne Freigabe-Gate ist kein
 * Autopilot, sondern ein Risiko; `validateAutopilotCatalog` macht solche
 * Eintraege sichtbar, statt sie zu dulden.
 */

export type AutopilotStatus = "active" | "recommended" | "not-useful";

/** Wie ein Lauf ausgeloest wird. */
export type AutopilotTriggerKind = "cron" | "timer" | "route" | "parent" | "manual";

export type AutopilotTrigger = {
  kind: AutopilotTriggerKind;
  /**
   * Nachweis der Verdrahtung:
   * - cron/timer: Repo-Pfad der Datei, die den Lauf startet
   * - route/manual: HTTP-Pfad oder Aufrufstelle im Server
   * - parent: id des Dachlaufs
   */
  ref: string;
  /** Nur bei kind "cron": der Cron-Ausdruck, wie er im Workflow steht. */
  cron?: string;
};

export type AutopilotEntry = {
  id: string;
  label: string;
  trigger: AutopilotTrigger;
  /** Wann der Lauf stattfindet, in Klartext. */
  cadence: string;
  /** Was er tatsaechlich veraendert. */
  writes: string;
  /** Was ihn bremst oder absichert. */
  gates: string[];
  status: AutopilotStatus;
  /** Warum genau dieser Lauf sinnvoll (oder eben nicht) ist. */
  rationale: string;
  /** Nur fuer Kind-Laeufe eines Dachlaufs: dessen id. */
  parent?: string;
  /** Nur bei status "recommended": was fehlt, damit er sinnvoll wird. */
  prerequisite?: string;
};

export const AUTOPILOTS: readonly AutopilotEntry[] = [
  {
    id: "control-center",
    label: "Control-Center-Autopilot (Dachlauf)",
    trigger: { kind: "cron", ref: ".github/workflows/control-center-autopilot.yml", cron: "17 */2 * * *" },
    cadence: "alle 2 Stunden (Cron :17), nach Push-Deploy auf main und nach manuellem Render-Deploy",
    writes: "Revenue-Scans, Optimierungs-Experimente, Entwuerfe, Hub-Abdeckung, Discovery, Growth-Schritte",
    gates: [
      "METRICS_TOKEN",
      "Freigabe fuer Veroeffentlichung",
      "Preis-/Geldaktionen ausgeschlossen",
      "207 = Lauf durch, aber Punkte warten",
    ],
    status: "active",
    rationale:
      "Ein Lauf buendelt alle Schritte, damit Signale gemeinsam bewertet werden statt in Einzelteilen.",
  },
  {
    id: "hub-drafts",
    label: "Hub-Entwuerfe (Loop-Abdeckung)",
    parent: "control-center",
    trigger: { kind: "parent", ref: "control-center" },
    cadence: "im Dachlauf, alle 2 Stunden",
    writes: "pending-Entwuerfe fuer die vier Loop-Stufen je Bereich + Loop-Engineering-Entwurf",
    gates: ["Queue-Limits", "Wochen-Dedupe", "Freigabe vor Veroeffentlichung"],
    status: "active",
    rationale:
      "Ohne Nachschub verhungert jeder Loop; die Rotation verhindert, dass die Queue volllaeuft.",
  },
  {
    id: "revenue-discovery",
    label: "Umsatz-Discovery",
    parent: "control-center",
    trigger: { kind: "parent", ref: "control-center" },
    cadence: "im Dachlauf, alle 2 Stunden",
    writes: "Ideen-Entwuerfe fuer neue oder integrierbare Umsatzwege",
    gates: ["nur belegte Signale", "max. 4 Entwuerfe je Lauf", "Wochen-Dedupe", "Freigabe"],
    status: "active",
    rationale:
      "Sucht dort, wo Daten existieren (Katalog, Angebotsluecken, rote Integrationen) statt zu raten.",
  },
  {
    id: "revenue-loop",
    label: "Revenue-Loop-Autopilot",
    trigger: {
      kind: "cron",
      ref: ".github/workflows/revenue-loop-autopilot.yml",
      cron: "40 5 * * *",
    },
    cadence: "taeglich 05:40 UTC",
    writes: "Loop-Report mit Urteil und Direktive sowie freigabepflichtige Aktionen als Entwurf",
    gates: ["keine Ansprache von Menschen", "Aktionen nur als Entwurf", "Konkurrenzschutz je Gruppe"],
    status: "active",
    rationale:
      "Der Tageslauf bewertet den groessten Hebel in Ruhe, waehrend der Zwei-Stunden-Lauf operativ nachlegt.",
  },
  {
    id: "publishing",
    label: "Publishing-Autopilot",
    trigger: { kind: "timer", ref: "server/publishing-service.ts" },
    cadence: "im Server-Takt alle 60 Sekunden, verarbeitet nur faellige Eintraege",
    writes: "Veroeffentlichung bereits freigegebener Bausteine",
    gates: ["nur freigegebene Eintraege", "Plattform-Credentials", "Sandbox-Fallback ohne Credentials"],
    status: "active",
    rationale:
      "Verteilung ist der langsamste Teil des Loops — hier zahlt Automatik direkt.",
  },
  {
    id: "outreach",
    label: "Outreach-Worker",
    trigger: { kind: "route", ref: "server/_core/index.ts" },
    cadence: "nach Anlass, nicht im Takt",
    writes: "Erstansprachen — nur mit aktiver Freigabe",
    gates: ["OUTREACH_LIVE=1", "Unsubscribe-URL", "Trockenlauf als Default"],
    status: "active",
    rationale:
      "Sinnvoll nur oberhalb einer Mindestqualitaet der Kontakte; darunter erzeugt es Imageschaden.",
  },
  {
    id: "integration-audit",
    label: "Integrations-Audit",
    trigger: { kind: "cron", ref: ".github/workflows/integration-audit.yml", cron: "15 6 * * *" },
    cadence: "taeglich 06:15 UTC",
    writes: "nichts — prueft Backend, Provider-Schluessel und DNS lesend",
    gates: ["nur Lesen", "Secrets nur als Existenz, nie als Wert"],
    status: "active",
    rationale:
      "Ein gruener Audit, der tote Integrationen nicht bemerkt, ist wertlos; deshalb die Live-Pruefung.",
  },
  {
    id: "tech-scanner",
    label: "Tech-Scanner",
    trigger: { kind: "cron", ref: ".github/workflows/tech-scanner.yml", cron: "30 5 * * *" },
    cadence: "taeglich 05:30 UTC",
    writes: "Research-Report in docs/research und ein fortgeschriebenes Issue",
    gates: ["nur oeffentliche Quellen", "Report committet mit [skip ci]"],
    status: "active",
    rationale:
      "Frueh erkennen, welche Tools und Integrationen neu verfuegbar sind — Grundlage fuer Discovery.",
  },
  {
    id: "integration-health",
    label: "Integrations-Health",
    trigger: { kind: "route", ref: "server/integration-health-router.ts" },
    cadence: "auf Abruf (Admin/UI), 5-Minuten-Cache",
    writes: "nichts — nur lesende Pruefung",
    gates: ["protectedProcedure", "Cache gegen Quota-Verbrauch"],
    status: "recommended",
    prerequisite: "Ein Alarmkanal, der einen roten Befund auch zustellt (Telegram ist konfiguriert, Mail nicht).",
    rationale:
      "Ein 30-Minuten-Cron waere sinnvoll, sobald Alarme ankommen: ein Cron ohne Empfaenger ist Rauschen.",
  },
  {
    id: "marketplace-scan",
    label: "Marktplatz-DauerScan",
    trigger: { kind: "manual", ref: "server/revenue-discovery-service.ts" },
    cadence: "keine — wartet auf Plattform-API",
    writes: "Kandidaten aus externen Katalogen",
    gates: ["Plattform-API mit Provisionsdaten"],
    status: "recommended",
    prerequisite: "Digistore24-API-Zugang mit Provisions- und Verkaufszahlen.",
    rationale:
      "Sinnvoll, sobald die API Provisions- und Verkaufsdaten liefert; ohne diese Zahlen waere die Bewertung geraten.",
  },
  {
    id: "price-tuning",
    label: "Automatische Preisoptimierung",
    trigger: { kind: "manual", ref: "server/monetization-router.ts" },
    cadence: "keine — bewusst nicht gebaut",
    writes: "Preise an echten Produkten",
    gates: ["nicht gebaut"],
    status: "not-useful",
    rationale:
      "Zu wenig Daten pro Preisstufe: eine Automatik wuerde aus Rauschen Preise aendern. Erst Messvolumen, dann Automatik.",
  },
];

export type AutopilotCatalogIssue = {
  id: string;
  problem: string;
};

/**
 * Prueft den Katalog gegen seine eigenen Regeln. Bewusst ohne Netz und ohne
 * Dateisystem — die Verdrahtung selbst prueft der Wiring-Test.
 */
export function validateAutopilotCatalog(entries: readonly AutopilotEntry[] = AUTOPILOTS): AutopilotCatalogIssue[] {
  const issues: AutopilotCatalogIssue[] = [];
  const ids = new Set<string>();

  for (const entry of entries) {
    if (ids.has(entry.id)) issues.push({ id: entry.id, problem: "id doppelt vergeben" });
    ids.add(entry.id);
    if (!entry.trigger?.ref) issues.push({ id: entry.id, problem: "ohne Trigger-Referenz" });
    if (entry.status === "active" && entry.gates.length === 0) {
      issues.push({ id: entry.id, problem: "aktiv, aber ohne Gate" });
    }
    if (entry.status === "active" && entry.gates.every((gate) => gate === "nicht gebaut")) {
      issues.push({ id: entry.id, problem: "aktiv, aber Gate sagt 'nicht gebaut'" });
    }
    if (entry.status === "recommended" && !entry.prerequisite) {
      issues.push({ id: entry.id, problem: "empfohlen, aber ohne Voraussetzung" });
    }
    if (entry.status === "not-useful" && entry.rationale.length < 40) {
      issues.push({ id: entry.id, problem: "abgelehnt, aber ohne nachvollziehbare Begruendung" });
    }
    if (entry.trigger.kind === "parent" && !entry.parent) {
      issues.push({ id: entry.id, problem: "Kind-Lauf ohne parent" });
    }
    if (entry.parent && !entries.some((other) => other.id === entry.parent)) {
      issues.push({ id: entry.id, problem: `parent "${entry.parent}" existiert nicht` });
    }
    if (entry.trigger.kind === "cron" && !entry.trigger.cron) {
      issues.push({ id: entry.id, problem: "Cron-Lauf ohne Cron-Ausdruck" });
    }
  }
  return issues;
}

export type AutopilotOverview = {
  autopilots: AutopilotEntry[];
  summary: { active: number; recommended: number; notUseful: number };
  /** Kind-Laeufe je Dachlauf — damit die UI nicht raten muss. */
  children: Record<string, string[]>;
  issues: AutopilotCatalogIssue[];
  /** Klartext-Empfehlung fuer den naechsten Ausbauschritt. */
  nextSensibleStep: string;
};

export function buildAutopilotOverview(entries: readonly AutopilotEntry[] = AUTOPILOTS): AutopilotOverview {
  const active = entries.filter((entry) => entry.status === "active");
  const recommended = entries.filter((entry) => entry.status === "recommended");
  const notUseful = entries.filter((entry) => entry.status === "not-useful");
  const children: Record<string, string[]> = {};
  for (const entry of entries) {
    if (!entry.parent) continue;
    children[entry.parent] = [...(children[entry.parent] ?? []), entry.id];
  }
  const next = recommended[0];
  return {
    autopilots: [...entries],
    summary: { active: active.length, recommended: recommended.length, notUseful: notUseful.length },
    children,
    issues: validateAutopilotCatalog(entries),
    nextSensibleStep: next
      ? `${next.label}: ${next.prerequisite ?? next.rationale}`
      : "Alle sinnvollen Laeufe sind aktiv; naechster Schritt ist Messvolumen, nicht mehr Automatik.",
  };
}

/** Filtert nach Status — damit die UI nicht selbst sortieren muss. */
export function autopilotsByStatus(
  status: AutopilotStatus,
  entries: readonly AutopilotEntry[] = AUTOPILOTS,
): AutopilotEntry[] {
  return entries.filter((entry) => entry.status === status);
}
