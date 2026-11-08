/**
 * Hub-Entwurfs-Abdeckung: jeder Geschaeftsbereich (Hub) braucht Entwuerfe,
 * und zwar nicht irgendwelche, sondern die vier Stufen eines Loops.
 *
 * Der Gedanke dahinter: ein einzelner Post ist keine Umsatzmaschine. Erst der
 * geschlossene Kreis erzeugt Ertrag —
 *   attention (Aufmerksamkeit) → trust (Vertrauen) → offer (Angebot) → reuse
 *   (Wiederverwendung: der Inhalt wird zum zweiten und dritten Kanal).
 *
 * Diese Datei ist bewusst rein: keine Datenbank, kein Netz, kein LLM. Sie
 * beschreibt *was* gebraucht wird (Soll) und vergleicht das mit dem, was in
 * der Entwurfs-Queue liegt (Ist). Die Durchfuehrung macht
 * `server/hub-draft-autopilot.ts`.
 *
 * Wahrheitsregel: Entwuerfe enthalten keine erfundenen Zahlen. Reichweite,
 * Umsatz und Conversion stehen dort als Hypothesen mit Metrik-Namen, nicht
 * als behauptete Ergebnisse.
 */
import {
  INFLUENCER_PERSONAS,
  type InfluencerPersonaId,
  type InfluencerPlatform,
} from "./influencer-persona-logic";
import type { RevenueHub } from "./draft-engine-logic";

/** Die acht Bereiche, in denen das Control Center Geld verdient oder Reichweite aufbaut. */
export type DraftHubId = "hara" | "saas" | "loop" | "trading" | "reach" | "faceless" | "b2b" | "affiliate";

export const DRAFT_HUB_IDS: readonly DraftHubId[] = [
  "hara",
  "saas",
  "loop",
  "trading",
  "reach",
  "faceless",
  "b2b",
  "affiliate",
] as const;

/** Die vier Loop-Stufen, in fester Reihenfolge. */
export type LoopStage = "attention" | "trust" | "offer" | "reuse";

export const LOOP_STAGES: readonly LoopStage[] = ["attention", "trust", "offer", "reuse"] as const;

export const LOOP_STAGE_LABELS: Readonly<Record<LoopStage, string>> = {
  attention: "Aufmerksamkeit",
  trust: "Vertrauen",
  offer: "Angebot",
  reuse: "Wiederverwendung",
};

export type StageBlueprint = {
  /** Was diese Stufe leisten soll. */
  intent: string;
  /** Formate, in denen die Stufe glaubwuerdig funktioniert. */
  formats: readonly string[];
  /** Handlungsaufruf; bewusst ohne Erfolgsversprechen. */
  cta: string;
};

export type HubDefinition = {
  id: DraftHubId;
  label: string;
  /** Wofuer der Hub da ist — ein Satz, der im Entwurf wieder auftaucht. */
  purpose: string;
  /** Zuordnung zur bestehenden Revenue-Hub-Achse der Draft-Engine. */
  revenueHub: RevenueHub;
  /** Persoenlichkeiten, die den Hub glaubwuerdig bespielen (erste hat Vorrang). */
  personas: readonly InfluencerPersonaId[];
  platforms: readonly InfluencerPlatform[];
  /** Metrik, an der sich der Loop messen lassen muss. */
  metric: string;
  /** Was als naechster echter Messpunkt fehlt (kein erfundener Ist-Wert). */
  measurementGap: string;
  stages: Readonly<Record<LoopStage, StageBlueprint>>;
};

const stage = (intent: string, formats: readonly string[], cta: string): StageBlueprint => ({ intent, formats, cta });

export const HUB_DEFINITIONS: readonly HubDefinition[] = [
  {
    id: "hara",
    label: "HARA Coaching & Programme",
    purpose: "Menschen von Ueberforderung zu einem umsetzbaren naechsten Schritt bringen",
    revenueHub: "hara",
    personas: ["mira", "lina"],
    platforms: ["instagram", "tiktok", "threads"],
    metric: "Anmeldungen pro 100 Sitzungen aus dem Programm-Link",
    measurementGap: "Programm-Link-Klicks und Anmeldungen je Kanal fehlen als Messpunkt",
    stages: {
      attention: stage("Ein Alltagsproblem so benennen, dass es wiedererkannt wird", ["Reel", "Kurzvideo"], "Speichere den Beitrag fuer den naechsten vollen Tag"),
      trust: stage("Einen echten, kleinen Ablauf zeigen, der ohne Kauf funktioniert", ["Karussell", "Text-Post"], "Schreib in die Kommentare, welcher Schritt bei dir haengt"),
      offer: stage("Das Programm als Abkuerzung erklaeren, Grenzen ehrlich benennen", ["Video mit Gesicht zur Marke", "Text-Post"], "Pruefe im Programm, ob der Ablauf zu dir passt"),
      reuse: stage("Die besten Fragen aus Kommentaren zu einem zweiten Beitrag machen", ["Reel", "Thread"], "Schick die Frage, die dich am meisten blockiert"),
    },
  },
  {
    id: "saas",
    label: "SaaS & Tools",
    purpose: "Werkzeuge zeigen, die eine konkrete Aufgabe messbar kuerzer machen",
    revenueHub: "saas",
    personas: ["juno", "nova"],
    platforms: ["linkedin", "x", "threads"],
    metric: "Aktivierungen pro 100 Besuche der Produktseite",
    measurementGap: "Besuche, Aktivierungen und Kündigungen je Quelle fehlen als Messpunkt",
    stages: {
      attention: stage("Eine wiederkehrende Arbeit zeigen, die niemand gern macht", ["Kurzvideo", "Text-Post"], "Notiere deine laestigste Routine"),
      trust: stage("Vorher/Nachher eines Ablaufs zeigen, ohne Zeitgewinne zu erfinden", ["Karussell", "Screenshot-Post"], "Frag nach dem Ablauf, wenn du ihn nachbauen willst"),
      offer: stage("Pricing-Logik erklaeren: wer zahlt wofuer, wer nicht", ["Text-Post", "Video"], "Rechne mit deinem eigenen Volumen nach"),
      reuse: stage("Ein Interview-Zitat oder eine Kundenfrage zum Anlass nehmen", ["Text-Post", "Karussell"], "Stell die naechste Frage, die wir beantworten sollen"),
    },
  },
  {
    id: "loop",
    label: "Loop-Engineering & Funnels",
    purpose: "Aus Aufmerksamkeit einen Kreislauf machen, der ohne neue Reichweite weiterarbeitet",
    revenueHub: "loop",
    personas: ["juno", "zara"],
    platforms: ["linkedin", "x", "instagram"],
    metric: "Wiederkehrende Besucher pro 100 Erstbesucher",
    measurementGap: "Wiederkehr und Wiederverwendung je Inhalt fehlen als Messpunkt",
    stages: {
      attention: stage("Einen Loop als Denkfigur zeigen, nicht als Zauberformel", ["Karussell", "Text-Post"], "Zeichne deinen eigenen Loop in drei Schritten"),
      trust: stage("Einen Loop zerlegen und zeigen, wo er typischerweise reisst", ["Text-Post", "Video"], "Sag uns, an welcher Stelle dein Loop reisst"),
      offer: stage("Den Aufbau als nachvollziehbaren Ablauf anbieten", ["Text-Post", "Video"], "Pruefe den Ablauf gegen deinen aktuellen Trichter"),
      reuse: stage("Loop-Ergebnisse als Serie weiterfuehren, jede Woche ein Glied", ["Karussell", "Thread"], "Abonniere die Serie, wenn du den naechsten Schritt brauchst"),
    },
  },
  {
    id: "trading",
    label: "Finanzbildung & Marktlesen",
    purpose: "Risiko und Begriffe so erklaeren, dass Entscheidungen ruhiger werden",
    revenueHub: "trading",
    personas: ["kaya"],
    platforms: ["threads", "linkedin", "x"],
    metric: "Abschluesse von Bildungsangeboten pro 100 Sitzungen",
    measurementGap: "Abschluesse je Kanal und Rueckgabe-/Widerrufsquote fehlen als Messpunkt",
    stages: {
      attention: stage("Einen verbreiteten Denkfehler benennen, ohne jemanden laecherlich zu machen", ["Text-Post", "Kurzvideo"], "Pruefe deine eigene Annahme dazu"),
      trust: stage("Eine Rechnung vorrechnen, inklusive Annahmen und Risiko", ["Karussell", "Notiz-Post"], "Rechne mit deinen Zahlen nach"),
      offer: stage("Was das Bildungsangebot leistet und was ausdruecklich nicht", ["Text-Post"], "Lies die Annahmen, bevor du buchst"),
      reuse: stage("Die haeufigsten Fragen im Monat sammeln und gesammelt beantworten", ["Thread", "Karussell"], "Schick deine Frage fuer die naechste Auswertung"),
    },
  },
  {
    id: "reach",
    label: "Reichweite & Short-Form",
    purpose: "Reichweite systematisch testen statt auf Glueck hoffen",
    revenueHub: "loop",
    personas: ["zara", "lina"],
    platforms: ["tiktok", "instagram", "x"],
    metric: "Haltequote der ersten drei Sekunden",
    measurementGap: "Haltequote und Saves je Hook-Variante fehlen als Messpunkt",
    stages: {
      attention: stage("Drei Hooks gegeneinander testen, gleicher Inhalt", ["Kurzvideo", "Reel"], "Sag uns, welcher Hook dich gehalten hat"),
      trust: stage("Zeigen, wie ein Test aufgebaut wird und was daran schiefgeht", ["Video", "Karussell"], "Kommentiere, welchen Test wir als naechstes fahren"),
      offer: stage("Das Reichweiten-System als Ablauf erklaeren, ohne Zahlen zu versprechen", ["Text-Post", "Video"], "Pruefe, ob dein Kanal zum System passt"),
      reuse: stage("Gewinner-Clip in zweite Plattform uebersetzen statt kopieren", ["Reel", "Thread"], "Folge fuer die Umsetzung auf der zweiten Plattform"),
    },
  },
  {
    id: "faceless",
    label: "Faceless Channels",
    purpose: "Kanaele betreiben, die ohne Gesicht funktionieren, aber nicht ohne Haltung",
    revenueHub: "loop",
    personas: ["nova", "zara"],
    platforms: ["tiktok", "instagram", "threads"],
    metric: "Follower-Wachstum pro veroeffentlichtem Clip",
    measurementGap: "Wachstum je Clip und Kanal sowie Abbruchquote fehlen als Messpunkt",
    stages: {
      attention: stage("Ein Thema in einem Clip sofort nutzbar machen", ["Kurzvideo"], "Folge fuer die naechste Folge"),
      trust: stage("Die Herkunft der Aussagen offenlegen, Quellen nennen", ["Kurzvideo", "Text-Post"], "Pruefe die Quelle selbst"),
      offer: stage("Ein Produkt nennen, das zur Folge passt, mit Preis und Grenze", ["Kurzvideo"], "Pruefe, ob das Produkt dein Problem loest"),
      reuse: stage("Die Serie als Playlist buendeln und quer verlinken", ["Playlist", "Karussell"], "Starte mit Folge eins der Serie"),
    },
  },
  {
    id: "b2b",
    label: "B2B-Netzwerk & Partnerschaften",
    purpose: "Aus Kontakten Partnerschaften machen, die beiden Seiten etwas bringen",
    revenueHub: "saas",
    personas: ["juno", "nova"],
    platforms: ["linkedin", "x"],
    metric: "Antwortquote auf Erstansprache",
    measurementGap: "Antwortquote je Zielgruppe und Gespraechswert fehlen als Messpunkt",
    stages: {
      attention: stage("Eine Branchenbeobachtung teilen, die eine Antwort provoziert", ["Text-Post"], "Antworte mit deiner Beobachtung"),
      trust: stage("Einen Fall nachvollziehbar aufschluesseln, inklusive Fehlannahme", ["Karussell", "Text-Post"], "Frag nach dem Detail, das dich interessiert"),
      offer: stage("Eine klar begrenzte Zusammenarbeit beschreiben", ["Text-Post"], "Schreib uns, wenn die Grenzen zu dir passen"),
      reuse: stage("Aus einem Gespraech einen oeffentlichen Lernpunkt machen", ["Text-Post", "Karussell"], "Teile den Punkt mit jemandem, den er betrifft"),
    },
  },
  {
    id: "affiliate",
    label: "Affiliate & Produktkatalog",
    purpose: "Empfehlungen so belegen, dass sie auch ohne Kauf nuetzlich sind",
    revenueHub: "hara",
    personas: ["lina", "kaya"],
    platforms: ["instagram", "threads", "tiktok"],
    metric: "Provision pro 100 qualifizierten Klicks",
    measurementGap: "Klicks, Abschluesse und Storno je Produkt fehlen als Messpunkt",
    stages: {
      attention: stage("Ein Problem zeigen, fuer das es mehrere Loesungen gibt", ["Kurzvideo", "Karussell"], "Sag uns, welche Loesung du schon probiert hast"),
      trust: stage("Einen Testbericht mit Nachteilen veroeffentlichen", ["Karussell", "Text-Post"], "Pruefe den Nachteil, der dich betrifft"),
      offer: stage("Empfehlung mit Preis, Bedingungen und Alternative nennen", ["Text-Post", "Video"], "Vergleiche Preis und Bedingungen selbst"),
      reuse: stage("Die Bewertungen nach Anwendungsfall neu sortieren", ["Karussell", "Thread"], "Nimm die Liste fuer deinen Fall"),
    },
  },
] as const;

export function getHubDefinition(id: DraftHubId): HubDefinition | undefined {
  return HUB_DEFINITIONS.find((hub) => hub.id === id);
}

export function isDraftHubId(value: unknown): value is DraftHubId {
  return typeof value === "string" && (DRAFT_HUB_IDS as readonly string[]).includes(value);
}

export function isLoopStage(value: unknown): value is LoopStage {
  return typeof value === "string" && (LOOP_STAGES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Soll-Plan
// ---------------------------------------------------------------------------

export type HubDraftJob = {
  hub: DraftHubId;
  hubLabel: string;
  stage: LoopStage;
  personaId: InfluencerPersonaId;
  platform: InfluencerPlatform;
  format: string;
  /** Stabiler Schluessel fuer die Queue-Deduplizierung. */
  dedupeKey: string;
  priority: number;
};

export type HubPlanOptions = {
  /** Referenzzeit fuer die Rotation; im Test fixierbar. */
  nowMs: number;
  hubs?: readonly DraftHubId[];
  /** Wie viele Stufen pro Hub und Lauf eingeplant werden (1 = Rotationsbetrieb). */
  stagesPerHub?: number;
  /** Wie viele Stufen bereits offen sind, je `hub:stage`. */
  covered?: Readonly<Record<string, number>>;
  /** ISO-Wochen-Schluessel fuer die Dedupe-Rotation (Default aus nowMs). */
  weekKey?: string;
};

/** Kalenderwoche als stabiler Rotationsschluessel (UTC, ISO-aehnlich genuegt hier). */
export function weekKeyFrom(nowMs: number): string {
  const date = new Date(nowMs);
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((Date.UTC(year, date.getUTCMonth(), date.getUTCDate()) - start) / 86_400_000);
  const week = Math.floor(dayOfYear / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function stageCoverageKey(hub: DraftHubId, stageName: LoopStage): string {
  return `${hub}:${stageName}`;
}

/**
 * Plant die fehlenden Loop-Stufen. Rotiert bewusst: pro Lauf eine Stufe je
 * Hub, damit die Queue nicht mit 32 Entwuerfen auf einmal volllaeuft und die
 * Freigabe nicht zum Flaschenhals wird.
 */
export function planHubDrafts(options: HubPlanOptions): HubDraftJob[] {
  const hubs = options.hubs ?? DRAFT_HUB_IDS;
  const stagesPerHub = Math.max(1, Math.min(LOOP_STAGES.length, options.stagesPerHub ?? 1));
  const weekKey = options.weekKey ?? weekKeyFrom(options.nowMs);
  const rotationOffset = Math.floor(options.nowMs / 86_400_000) % LOOP_STAGES.length;
  const covered = options.covered ?? {};
  const jobs: HubDraftJob[] = [];

  hubs.forEach((hubId, hubIndex) => {
    const hub = getHubDefinition(hubId);
    if (!hub) return;

    const missing = LOOP_STAGES.filter(
      (stageName) => (covered[stageCoverageKey(hubId, stageName)] ?? 0) === 0,
    );
    if (missing.length === 0) return;

    // Rotationsstart pro Hub versetzt, damit nicht alle Hubs dieselbe Stufe bauen.
    const ordered = LOOP_STAGES.map((_, index) => LOOP_STAGES[(index + rotationOffset + hubIndex) % LOOP_STAGES.length]);
    const chosen = ordered.filter((stageName) => missing.includes(stageName)).slice(0, stagesPerHub);

    chosen.forEach((stageName, position) => {
      const blueprint = hub.stages[stageName];
      const personaId = hub.personas[(hubIndex + LOOP_STAGES.indexOf(stageName)) % hub.personas.length];
      const platform = hub.platforms[(hubIndex + position) % hub.platforms.length];
      jobs.push({
        hub: hubId,
        hubLabel: hub.label,
        stage: stageName,
        personaId,
        platform,
        format: blueprint.formats[(hubIndex + position) % blueprint.formats.length],
        dedupeKey: `hub-draft:${hubId}:${stageName}:${weekKey}`,
        priority: LOOP_STAGES.indexOf(stageName),
      });
    });
  });

  return jobs.sort((a, b) => a.priority - b.priority || a.hub.localeCompare(b.hub));
}

// ---------------------------------------------------------------------------
// Entwuerfe bauen
// ---------------------------------------------------------------------------

export function personaFor(id: InfluencerPersonaId) {
  return INFLUENCER_PERSONAS.find((persona) => persona.id === id) ?? INFLUENCER_PERSONAS[0];
}

export type BuiltContentDraft = {
  hub: DraftHubId;
  loopStage: LoopStage;
  personaId: InfluencerPersonaId;
  platform: InfluencerPlatform;
  topic: string;
  content: string;
  disclosure: string;
  format: string;
  title: string;
};

/**
 * Baut einen Entwurf aus Hub, Stufe und Persona. Kein LLM: die Vorlage ist
 * deterministisch, damit der Lauf kostenlos und reproduzierbar bleibt und
 * keine erfundenen Zahlen entstehen. Die redaktionelle Zuspitzung passiert
 * bei der Freigabe durch den Menschen.
 */
export function buildHubContentDraft(job: HubDraftJob): BuiltContentDraft {
  const hub = getHubDefinition(job.hub);
  const persona = personaFor(job.personaId);
  if (!hub) throw new Error(`Unbekannter Hub: ${job.hub}`);

  const blueprint = hub.stages[job.stage];
  const topic = `${hub.label}: ${LOOP_STAGE_LABELS[job.stage]} — ${blueprint.intent}`;
  const content = [
    `Hook (${persona.catchphrases[0]}): ${blueprint.intent}.`,
    "",
    `Worum es geht: ${hub.purpose}.`,
    `Stufe im Loop: ${LOOP_STAGE_LABELS[job.stage]} — ${blueprint.intent}.`,
    `Format: ${job.format} auf ${job.platform}.`,
    "",
    `Ton: ${persona.tonality}. Zielgruppe: ${persona.audience}.`,
    `Inhaltlicher Schwerpunkt: ${persona.contentPillars[(LOOP_STAGES.indexOf(job.stage) + 1) % persona.contentPillars.length]}.`,
    "",
    `Handlungsaufruf: ${blueprint.cta}.`,
    "",
    `Messen: ${hub.metric}.`,
    `Offen (kein geschaetzter Wert): ${hub.measurementGap}.`,
    "",
    `Transparenz: ${persona.disclosure}`,
  ].join("\n");

  return {
    hub: hub.id,
    loopStage: job.stage,
    personaId: persona.id,
    platform: job.platform,
    topic,
    content,
    disclosure: persona.disclosure,
    format: job.format,
    title: `${hub.label} · ${LOOP_STAGE_LABELS[job.stage]} (${persona.name})`.slice(0, 200),
  };
}

export type BuiltLoopDraft = {
  hub: RevenueHub;
  sourceHub: DraftHubId;
  name: string;
  hypothesis: string;
  stages: string[];
  metric: string;
  experiment: string;
  baseline: string;
  target: string;
  autopilotKey: string;
  title: string;
};

/**
 * Loop-Engineering-Entwurf: beschreibt den Umsatz-Kreislauf eines Hubs als
 * pruefbare Hypothese. Bewusst ohne Zielzahl — die entsteht erst aus echten
 * Messdaten, sonst waere es eine erfundene Prognose.
 */
export function buildHubLoopDraft(hubId: DraftHubId): BuiltLoopDraft {
  const hub = getHubDefinition(hubId);
  if (!hub) throw new Error(`Unbekannter Hub: ${hubId}`);
  const persona = personaFor(hub.personas[0]);
  return {
    hub: hub.revenueHub,
    sourceHub: hub.id,
    name: `Loop ${hub.label}`,
    hypothesis: `Wenn ${hub.purpose}, dann steigt ${hub.metric} — solange die Stufen Aufmerksamkeit, Vertrauen, Angebot und Wiederverwendung alle bespielt werden.`,
    stages: LOOP_STAGES.map((stageName) => `${LOOP_STAGE_LABELS[stageName]}: ${hub.stages[stageName].intent}`),
    metric: hub.metric,
    experiment: `4 Wochen, je Stufe mindestens ein Entwurf pro Woche, Persona ${persona.name}; Abbruch, wenn zwei Wochen keine Verteilung stattfindet.`,
    baseline: "keine Messdaten vorhanden",
    target: "qualitativ: alle vier Stufen bespielt und gemessen",
    autopilotKey: `hub-loop:${hub.id}:v1`,
    title: `Loop-Engineering: ${hub.label}`.slice(0, 200),
  };
}

// ---------------------------------------------------------------------------
// Ist-Abgleich
// ---------------------------------------------------------------------------

export type DraftTagSource = {
  kind?: string;
  payload?: unknown;
  status?: string;
};

export function readDraftTags(row: DraftTagSource): { hub: DraftHubId | null; stage: LoopStage | null } {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const hub = isDraftHubId(payload.hub) ? payload.hub : null;
  const stageName = isLoopStage(payload.loopStage) ? payload.loopStage : null;
  return { hub, stage: stageName };
}

/** Zaehlt offene Entwuerfe je `hub:stage` — Grundlage fuer den naechsten Plan. */
export function countCoverage(rows: readonly DraftTagSource[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.status && row.status !== "pending") continue;
    const { hub, stage } = readDraftTags(row);
    if (!hub || !stage) continue;
    const key = stageCoverageKey(hub, stage);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export type HubStageState = { stage: LoopStage; label: string; covered: boolean; openDrafts: number };

export type HubCoverage = {
  hub: DraftHubId;
  label: string;
  revenueHub: RevenueHub;
  personas: readonly InfluencerPersonaId[];
  metric: string;
  stages: HubStageState[];
  coveredStages: number;
  coveragePct: number;
  /** Naechster sinnvoller Schritt, in Klartext. */
  nextStep: string;
};

export type CoverageSummary = {
  hubs: HubCoverage[];
  totalStages: number;
  coveredStages: number;
  coveragePct: number;
  completeHubs: DraftHubId[];
  emptyHubs: DraftHubId[];
};

/**
 * Abdeckung je Hub. `coveragePct` zaehlt nur besetzte Stufen, nicht die Menge
 * der Entwuerfe: drei Aufmerksamkeits-Posts ersetzen kein Angebot.
 */
export function buildCoverage(rows: readonly DraftTagSource[], hubs: readonly DraftHubId[] = DRAFT_HUB_IDS): CoverageSummary {
  const counts = countCoverage(rows);
  const coverage: HubCoverage[] = hubs.flatMap((hubId) => {
    const hub = getHubDefinition(hubId);
    if (!hub) return [];
    const stages: HubStageState[] = LOOP_STAGES.map((stageName) => ({
      stage: stageName,
      label: LOOP_STAGE_LABELS[stageName],
      covered: (counts[stageCoverageKey(hubId, stageName)] ?? 0) > 0,
      openDrafts: counts[stageCoverageKey(hubId, stageName)] ?? 0,
    }));
    const coveredStages = stages.filter((entry) => entry.covered).length;
    const missingStage = stages.find((entry) => !entry.covered);
    return [
      {
        hub: hub.id,
        label: hub.label,
        revenueHub: hub.revenueHub,
        personas: hub.personas,
        metric: hub.metric,
        stages,
        coveredStages,
        coveragePct: Math.round((coveredStages / LOOP_STAGES.length) * 100),
        nextStep: missingStage
          ? `Entwurf fuer "${missingStage.label}" fehlt (${hub.metric})`
          : "alle vier Stufen besetzt — jetzt Verteilung und Messung pruefen",
      },
    ];
  });

  const totalStages = coverage.length * LOOP_STAGES.length;
  const coveredStages = coverage.reduce((sum, hub) => sum + hub.coveredStages, 0);
  return {
    hubs: coverage,
    totalStages,
    coveredStages,
    coveragePct: totalStages === 0 ? 0 : Math.round((coveredStages / totalStages) * 100),
    completeHubs: coverage.filter((hub) => hub.coveredStages === LOOP_STAGES.length).map((hub) => hub.hub),
    emptyHubs: coverage.filter((hub) => hub.coveredStages === 0).map((hub) => hub.hub),
  };
}
