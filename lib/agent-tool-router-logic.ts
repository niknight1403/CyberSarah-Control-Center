/**
 * Faehigkeitsparitaet 4/6 — Tool-Router: reine, deterministische Logik,
 * die Agent-Anfragen an die richtigen Werkzeuge legt (Base44-Pendant:
 * run_skill, bash, web_search, browser, generate_image, transcribe_audio).
 *
 * Datenfluss:
 *   Eine Anfrage (Intent + Kontext) wird gegen die registrierten Tools
 *   geroutet: lokales Tool kann sie bedienen, externe nur mit konfigu-
 *   rierter Anbindung. Jedes Tool nennt seinen Preis (hier: alles gratis
 *   bzw. ehrlich markiert).
 *
 * Ehrlichkeits-Grenze: Kein passendes Tool = klare Absage mit Grund,
 *   NIE ein Fake-Ergebnis. Externe Tools ohne Konfiguration bleiben
 *   ehrlich "nicht konfiguriert" — und werden nicht als vorhanden gelistet.
 */

export type ToolId =
  | "code-suche"
  | "workspace-dateien"
  | "entity-crud"
  | "bild-generierung"
  | "web-suche"
  | "browser"
  | "transkription";

export type ToolSpec = {
  id: ToolId;
  description: string;
  /** lokal = immer gratis verfuegbar; extern braucht eine (kostenlose) Anbindung. */
  kind: "lokal" | "extern";
  /** Bei extern: Ist die (kostenlose) Anbindung konfiguriert? */
  configured: boolean;
};

export type ToolRequest = {
  intent:
    | "suche-im-code"
    | "datei-lesen-schreiben"
    | "daten-speichern"
    | "bild-erzeugen"
    | "im-web-suchen"
    | "seite-oeffnen"
    | "audio-verstehen";
};

const INTENT_TOOL: Record<ToolRequest["intent"], ToolId> = {
  "suche-im-code": "code-suche",
  "datei-lesen-schreiben": "workspace-dateien",
  "daten-speichern": "entity-crud",
  "bild-erzeugen": "bild-generierung",
  "im-web-suchen": "web-suche",
  "seite-oeffnen": "browser",
  "audio-verstehen": "transkription",
};

/** Standard-Registry: lokale Tools immer an, externe nur wenn konfiguriert. */
export function defaultToolRegistry(configuredExternal: Partial<Record<ToolId, boolean>>): ToolSpec[] {
  const base: Record<ToolId, Omit<ToolSpec, "configured">> = {
    "code-suche": { id: "code-suche", description: "Code durchsuchen (grep-artig)", kind: "lokal" },
    "workspace-dateien": { id: "workspace-dateien", description: "Dateien lesen/schreiben", kind: "lokal" },
    "entity-crud": { id: "entity-crud", description: "Datensaetze speichern/lesen", kind: "lokal" },
    "bild-generierung": { id: "bild-generierung", description: "Bilder generieren", kind: "extern" },
    "web-suche": { id: "web-suche", description: "Websuche", kind: "extern" },
    browser: { id: "browser", description: "Seiten oeffnen und lesen", kind: "extern" },
    transkription: { id: "transkription", description: "Audio zu Text", kind: "extern" },
  };
  return (Object.keys(base) as ToolId[]).map((id) => ({
    ...base[id],
    configured: base[id].kind === "lokal" ? true : configuredExternal[id] ?? false,
  }));
}

export type RoutingDecision =
  | { ok: true; tool: ToolSpec; cost: "gratis" }
  | { ok: false; reason: "kein tool" | "nicht konfiguriert"; toolId: ToolId };

/** Anfrage routen — ehrlich, inklusive Absagegrund. */
export function routeToolRequest(tools: ToolSpec[], request: ToolRequest): RoutingDecision {
  const wanted = INTENT_TOOL[request.intent];
  const tool = tools.find((t) => t.id === wanted);
  if (!tool) return { ok: false, reason: "kein tool", toolId: wanted };
  if (!tool.configured) return { ok: false, reason: "nicht konfiguriert", toolId: wanted };
  return { ok: true, tool, cost: "gratis" };
}

/** Nutzer-Uebersicht: verfuegbare Tools ja, unkonfigurierte ehrlich grau. */
export function describeTools(tools: ToolSpec[]): string {
  return tools
    .map((t) => {
      if (t.kind === "lokal") return `- ${t.id}: ${t.description} (lokal, gratis)`;
      return t.configured
        ? `- ${t.id}: ${t.description} (extern angebunden, gratis)`
        : `- ${t.id}: ${t.description} (NICHT konfiguriert — ehrlich abwesend)`;
    })
    .join("\n");
}

/** Faehigkeitsabdeckung: welche Intents kann der Agent ERNST bedienen? */
export function coveredIntents(tools: ToolSpec[]): ToolRequest["intent"][] {
  const intents = Object.keys(INTENT_TOOL) as ToolRequest["intent"][];
  return intents.filter((intent) => routeToolRequest(tools, { intent } as ToolRequest).ok);
}
