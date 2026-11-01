/**
 * Sprint 3 — AI Influenza Team: Agenten-Orchestrierung (pure, testbar).
 *
 * Acht spezialisierte Agenten laut Master-Prompt Phase 7. Die Logik hier ist
 * bewusst frei von DB/LLM-Abhaengigkeiten, damit Routing, Priorisierung und
 * Freigabe-Gates ohne Live-Infrastruktur getestet werden koennen.
 *
 * Betriebsmodus-Konvention (Master-Prompt §8): Standard ist "assisted" —
 * interne Aufgaben laufen automatisch, externe Aktionen (Kontakt, Versand,
 * Veroeffentlichung, Preisänderung) erfordern Freigabe.
 */

export const AI_AGENTEN_TYPEN = [
  "ceo",
  "market_intelligence",
  "lead_discovery",
  "sales_conversion",
  "content_production",
  "video_creative",
  "customer_success",
  "profit_optimizer",
] as const;
export type AgentTyp = (typeof AI_AGENTEN_TYPEN)[number];

export interface AgentDefinition {
  typ: AgentTyp;
  name: string;
  rolle: string;
}

export const AI_AGENTEN: readonly AgentDefinition[] = Object.freeze([
  { typ: "ceo", name: "CEO & Business Orchestrator", rolle: "Koordiniert Agenten, priorisiert rentable Aufgaben, kontrolliert Kosten, erstellt Geschäftsberichte." },
  { typ: "market_intelligence", name: "Market Intelligence", rolle: "Analysiert Nischen und Wettbewerber, identifiziert Kundenprobleme, entwickelt Dienstleistungsangebote." },
  { typ: "lead_discovery", name: "Lead Discovery", rolle: "Recherchiert öffentliche Geschäftskontakte, bewertet Zielunternehmen, achtet DSGVO." },
  { typ: "sales_conversion", name: "Sales & Conversion", rolle: "Erstellt Angebote und Landingpages, verwaltet Pipelines, bereitet zulässige Kontaktaufnahmen vor." },
  { typ: "content_production", name: "Content Production", rolle: "Erstellt Social-Beiträge, Content-Kalender und Kampagnen." },
  { typ: "video_creative", name: "Video & Creative Studio", rolle: "Generiert Skripte, Storyboards und Formate für Reels und Shorts." },
  { typ: "customer_success", name: "Customer Success", rolle: "Überwacht Aufträge, Liefertermine, Fortschrittsberichte und Kündigungsrisiken." },
  { typ: "profit_optimizer", name: "Revenue & Profit Optimizer", rolle: "Analysiert Umsätze, Deckungsbeiträge und API-Kosten, empfiehlt Preisoptimierungen." },
]);

export function findAgent(typ: string): AgentDefinition | undefined {
  return AI_AGENTEN.find((a) => a.typ === typ);
}

// ---------------------------------------------------------------------------
// Aufgabentypen
// ---------------------------------------------------------------------------
export interface AufgabeTypDefinition {
  id: string;
  agentTyp: AgentTyp;
  titel: string;
  /** true = Ergebnis ist ein Entwurf, der eine Freigabe erfordert (externe Wirkung). */
  freigabePflichtig: boolean;
  /** Revenue-First: höher = dringlicher (Lead/Zahlung vor Content). */
  prioritaet: number;
}

export const AUFGABE_TYPEN: readonly AufgabeTypDefinition[] = Object.freeze([
  { id: "angebot_entwurf", agentTyp: "sales_conversion", titel: "Angebotsentwurf erstellen", freigabePflichtig: true, prioritaet: 95 },
  { id: "lead_recherche", agentTyp: "lead_discovery", titel: "Zielkontakte recherchieren", freigabePflichtig: true, prioritaet: 90 },
  { id: "marktanalyse", agentTyp: "market_intelligence", titel: "Marktnische analysieren", freigabePflichtig: false, prioritaet: 80 },
  { id: "kunden_report", agentTyp: "customer_success", titel: "Kunden-/Auftragsbericht erstellen", freigabePflichtig: false, prioritaet: 75 },
  { id: "content_erstellen", agentTyp: "content_production", titel: "Content-Beiträge erstellen", freigabePflichtig: true, prioritaet: 60 },
  { id: "video_skript", agentTyp: "video_creative", titel: "Video-Skript erstellen", freigabePflichtig: true, prioritaet: 50 },
  { id: "profit_analyse", agentTyp: "profit_optimizer", titel: "Profitabilität analysieren", freigabePflichtig: false, prioritaet: 40 },
  { id: "preis_vorschlag", agentTyp: "profit_optimizer", titel: "Preisoptimierung vorschlagen", freigabePflichtig: true, prioritaet: 35 },
  { id: "orchestrierung", agentTyp: "ceo", titel: "Tagespriorisierung erstellen", freigabePflichtig: false, prioritaet: 20 },
]);

export function findAufgabeTyp(id: string): AufgabeTypDefinition | undefined {
  return AUFGABE_TYPEN.find((t) => t.id === id);
}

/** Welcher Agent ist für diesen Aufgabentyp zuständig? */
export function agentFuerAufgabe(aufgabeTyp: string): AgentTyp | undefined {
  return findAufgabeTyp(aufgabeTyp)?.agentTyp;
}

// ---------------------------------------------------------------------------
// Aufgaben-Statusmaschine
// ---------------------------------------------------------------------------
export const AUFGABE_STATUS = [
  "queued",
  "running",
  "freigabe_offen",
  "erledigt",
  "fehlgeschlagen",
  "abgebrochen",
] as const;
export type AufgabeStatus = (typeof AUFGABE_STATUS)[number];

const AUFGABE_UEBERGAENGE: Record<AufgabeStatus, readonly AufgabeStatus[]> = {
  queued: ["running", "abgebrochen"],
  running: ["freigabe_offen", "erledigt", "fehlgeschlagen", "queued"],
  freigabe_offen: ["erledigt", "queued", "abgebrochen"],
  erledigt: [],
  fehlgeschlagen: ["queued", "abgebrochen"],
  abgebrochen: [],
};

export function darfAufgabeWechseln(von: AufgabeStatus, nach: AufgabeStatus): boolean {
  return AUFGABE_UEBERGAENGE[von]?.includes(nach) ?? false;
}

/** Nach erfolgreicher Ausführung: Entwurf wartet auf Freigabe, sonst erledigt. */
export function statusNachAusfuehrung(aufgabeTyp: string): AufgabeStatus {
  return findAufgabeTyp(aufgabeTyp)?.freigabePflichtig ? "freigabe_offen" : "erledigt";
}

// ---------------------------------------------------------------------------
// Queue-Auswahl (Revenue First)
// ---------------------------------------------------------------------------
export interface QueueKandidat {
  id: number;
  aufgabeTyp: string;
  status: AufgabeStatus;
  prioritaet: number;
  versuche: number;
  maxVersuche: number;
  erstelltAmMs: number;
}

/**
 * Wählt die nächste ausführbare Aufgabe: höchste Priorität zuerst, bei
 * Gleichstand die älteste; fehlgeschlagene Aufgaben nur solange Versuche frei.
 */
export function waehleNaechsteAufgabe(kandidaten: QueueKandidat[]): QueueKandidat | undefined {
  const lauffaehig = kandidaten.filter(
    (k) => k.status === "queued" && k.versuche < k.maxVersuche,
  );
  if (lauffaehig.length === 0) return undefined;
  return [...lauffaehig].sort((a, b) => {
    if (b.prioritaet !== a.prioritaet) return b.prioritaet - a.prioritaet;
    return a.erstelltAmMs - b.erstelltAmMs;
  })[0];
}

/** Stabile Idempotenz-Kennung für doppelte Enqueues. */
export function baueIdempotenzKey(aufgabeTyp: string, eingabe: Record<string, unknown>): string {
  const normalisiert = JSON.stringify(eingabe ?? {}, Object.keys(eingabe ?? {}).sort());
  let hash = 2166136261;
  const text = `${aufgabeTyp}|${normalisiert}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${aufgabeTyp}:${(hash >>> 0).toString(36)}`;
}

/** Freigabe darf nur aus freigabe_offen erfolgen und braucht einen Freigeber. */
export function istFreigabeGueltig(status: AufgabeStatus, freigeber: string | null | undefined): boolean {
  return status === "freigabe_offen" && Boolean(freigeber && freigeber.trim().length > 0);
}
