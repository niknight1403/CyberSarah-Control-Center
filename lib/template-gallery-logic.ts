/**
 * Sprint 296 — Template-Galerie: reine, deterministische Logik fuer
 * eine erweiterte Vorlagen-Auswahl mit 5+ Startern und Kategorie-Filter.
 *
 * Datenfluss:
 *   Die Gallerie ist eine statische Registry (kein Server-Roundtrip).
 *   Filter und Auswahlergebnisse werden rein berechnet.
 *
 * Ehrlichkeits-Grenze: Templates sind Starter-Skelette—sie liefern
 *   Struktur und Konfiguration, aber keine fertigen Geschaeftslogik.
 *   Ehrliche Beschreibung je Template: was ist enthalten, was fehlt.
 */

export type TemplateCategory = "blank" | "dashboard" | "chat" | "media";

export type ProjectTemplate = {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  honestLimit: string;
  icon: "doc" | "chart.bar.fill" | "bubble.left.fill" | "film.fill";
};

/** Verfuegbare Kategorien fuer den Filter. */
export const TEMPLATE_CATEGORIES: readonly TemplateCategory[] = ["blank", "dashboard", "chat", "media"];

/** Kategorie-Display-Name (DE). */
export function categoryDisplayName(cat: TemplateCategory): string {
  const names: Record<TemplateCategory, string> = {
    blank: "Leer",
    dashboard: "Dashboard",
    chat: "Chat",
    media: "Medien",
  };
  return names[cat];
}

/**
 * 5+ Starter-Templates (die Kernanforderung des Sprints).
 * Jedes Template ist ehrlich beschrieben: was es liefert, was nicht.
 */
export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    id: "blank-minimal",
    name: "Leeres Projekt",
    description: "Minimaler Start: App-Shell mit Tab-Navigation und Login. Du baust alles selbst auf.",
    category: "blank",
    honestLimit: "Keine Geschäftslogik, keine(Server)-Konfiguration—bewusst leer für volle Kontrolle.",
    icon: "doc",
  },
  {
    id: "dashboard-overview",
    name: "Dashboard-Überblick",
    description: "Dashboard mit KPI-Karten, Aktivitätsliste und基础-Chart. Perfekt für Monitoring-Tools.",
    category: "dashboard",
    honestLimit: "Charts sind Mock-Daten—echte Datenanbindung muss selbst implementiert werden.",
    icon: "chart.bar.fill",
  },
  {
    id: "chat-assistant",
    name: "Chat-Assistent",
    description: "Chat-UI mit Nachrichtenliste, Eingabefeld und Model-Auswahl. Basis für KI-Konversation.",
    category: "chat",
    honestLimit: "Ohne API-Key liefert der Chat Mock-Antworten—echte KI-Integration erforderlich.",
    icon: "bubble.left.fill",
  },
  {
    id: "media-studio",
    name: "Medien-Studio",
    description: "Medien-Editor mit Timeline, Preview und Export-Button. Für Audio/Video-Projekte.",
    category: "media",
    honestLimit: "Render-Pipeline benötigt FFmpeg-Setup auf dem Server—lokale Preview nur mit Audio.",
    icon: "film.fill",
  },
  {
    id: "blank-typescript",
    name: "TypeScript-Starter",
    description: "Leeres Projekt mit vorkonfiguriertem TypeScript, ESLint und Vitest. Saubere Basis für App-Entwicklung.",
    category: "blank",
    honestLimit: "Keine UI-Komponenten—nur Tooling-Konfiguration. Ideal für Entwickler, die bei null anfangen wollen.",
    icon: "doc",
  },
  {
    id: "dashboard-analytics",
    name: "Analytics-Dashboard",
    description: "Erweitertes Dashboard mit Filter, Zeitbereich-Auswahl und Export. Für tiefe Datenanalyse.",
    category: "dashboard",
    honestLimit: "Export ist CSV-only—PDF/Excel-Export muss selbst nachgerüstet werden.",
    icon: "chart.bar.fill",
  },
  {
    id: "chat-multimodal",
    name: "Multimodal-Chat",
    description: "Chat mit Bild-Upload, Datei-Anhang und Code-Block-Rendering. Für technische Konversation.",
    category: "chat",
    honestLimit: "Bildverarbeitung nur mit konfiguriertem Vision-Modell—ohne bleibt Upload inaktiv.",
    icon: "bubble.left.fill",
  },
];

/** Filter-Ergebnis: rein, deterministisch, keine Nebenwirkungen. */
export function filterTemplatesByCategory(
  templates: readonly ProjectTemplate[],
  category: TemplateCategory | "all"
): ProjectTemplate[] {
  if (category === "all") return [...templates];
  return templates.filter((t) => t.category === category);
}

/** "all" als Pseudo-Kategorie fuer den UI-Filter. */
export type TemplateFilter = TemplateCategory | "all";

/** Anzahl der Templates pro Kategorie (fuer Badge-Zahlen in der UI). */
export function countTemplatesByCategory(
  templates: readonly ProjectTemplate[]
): Record<TemplateFilter, number> {
  const counts: Record<string, number> = { all: templates.length };
  for (const cat of TEMPLATE_CATEGORIES) {
    counts[cat] = templates.filter((t) => t.category === cat).length;
  }
  return counts as Record<TemplateFilter, number>;
}

/** Findet ein Template per ID (rein, undefined bei unbekannt). */
export function findTemplateById(
  templates: readonly ProjectTemplate[],
  id: string
): ProjectTemplate | undefined {
  return templates.find((t) => t.id === id);
}

/** Prueft, ob mindestens 5 Templates existieren ( Kernanforderung Sprint 296). */
export function hasMinimumTemplates(templates: readonly ProjectTemplate[]): boolean {
  return templates.length >= 5;
}
