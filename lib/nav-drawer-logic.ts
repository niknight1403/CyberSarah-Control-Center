/**
 * Nav-Drawer-Logik (rein, testbar) — Sprint 132.
 *
 * Modell für das seitliche Menü im Base44-Stil (Chat, Workflows, Plugins,
 * Meetings, Dateien, Gedächtnis, Daten, Agenteneinstellungen). Getrennt von
 * lib/viewport-logic.ts (Desktop-Sidebar), weil der Drawer bewusst mehr
 * Einträge zeigt als die kompakte Bottom-Tab-Leiste.
 */

export type DrawerRoute =
  | "/dashboard"
  | "/business"
  | "/media-studio"
  | "/commerce-studio"
  | "/account"
  | "/chat"
  | "/revenue-os"
  | "/micro-trading"
  | "/loop-engineering"
  | "/focus"
  | "/ideas"
  | "/decisions"
  | "/superagent"
  | "/designer"
  | "/plugins"
  | "/meetings"
  | "/cyber-terminal"
  | "/agent"
  | "/preview"
  | "/quality"
  | "/"
  | "/memory"
  | "/data"
  | "/settings";

export type DrawerItem = {
  route: DrawerRoute;
  title: string;
  icon:
    | "message.fill"
    | "wand.and.stars"
    | "paintpalette.fill"
    | "puzzlepiece.fill"
    | "video.fill"
    | "folder.fill"
    | "brain.head.profile"
    | "tablecells.fill"
    | "gearshape.fill"
    | "chevron.left.forwardslash.chevron.right"
    | "sparkles"
    | "play.rectangle.fill"
    | "hourglass"
    | "chart.bar.fill";
  badge?: string;
  keywords?: readonly string[];
  group: "start" | "revenue" | "studio" | "development" | "system";
};

/** Reihenfolge deckungsgleich mit dem Base44-Vorbild (Chat oben, Settings unten). */
/** Operatives Menü: Revenue zuerst, Admin- und Utility-Routen bleiben direkt erreichbar. */
export const DRAWER_ITEMS: readonly DrawerItem[] = [
  { route: "/dashboard", title: "Übersicht", icon: "chart.bar.fill", group: "start", keywords: ["status","gesundheit","betrieb","startseite"] },
  { route: "/chat", title: "KI-Chat", icon: "message.fill", group: "start", keywords: ["ki","assistent","prompt","fragen"] },
  { route: "/superagent", title: "Superagent & Workflows", icon: "wand.and.stars", group: "start", keywords: ["autopilot","orchestrierung","workflow"] },
  { route: "/revenue-os", title: "Revenue OS", icon: "chart.bar.fill", group: "revenue", keywords: ["umsatz","geld","stripe","monetarisierung"] },
  { route: "/business", title: "Business & Analytics", icon: "chart.bar.fill", group: "revenue", keywords: ["analyse","kunden","statistik"] },
  { route: "/focus", title: "Fokus & Rückblick", icon: "hourglass", group: "revenue", keywords: ["prioritaeten","aufgaben"] },
  { route: "/ideas", title: "Ideen-Inbox", icon: "sparkles", group: "revenue", keywords: ["ideen","entwurf"] },
  { route: "/decisions", title: "Entscheidungen", icon: "tablecells.fill", group: "revenue", keywords: ["entscheidung","protokoll"] },
  { route: "/media-studio", title: "Media Studio", icon: "video.fill", group: "studio", keywords: ["videos","reels","content","film"] },
  { route: "/commerce-studio", title: "Commerce Autopilot", icon: "chart.bar.fill", group: "studio", keywords: ["produkte","preis","gewinn","reels","landingpages","content studio","profit"] },
  { route: "/agent", title: "Agenten & Automatisierung", icon: "wand.and.stars", group: "development", keywords: ["programmierung","automation","entwicklung"] },
  { route: "/", title: "Workspace", icon: "folder.fill", group: "development", keywords: ["dateien","repository","github","code"] },
  { route: "/preview", title: "Vorschau", icon: "play.rectangle.fill", group: "development", keywords: ["vorschau","website","testen"] },
  { route: "/quality", title: "Qualität & Builds", icon: "chart.bar.fill", group: "development", keywords: ["apk","android","build","tests","release"] },
  { route: "/cyber-terminal", title: "Terminal", icon: "chevron.left.forwardslash.chevron.right", group: "development", keywords: ["logs","diagnose","terminal"] },
  { route: "/account", title: "Konto & Einstellungen", icon: "gearshape.fill", group: "system", keywords: ["profil","einstellungen","konto"] },
] as const;

/** Aktives Item anhand des Pfades auflösen — "/" nur bei exaktem Root-Treffer,
 * damit es andere Routen nicht als Präfix faelschlich "gewinnt". */
export function resolveActiveDrawerItem(pathname: string): DrawerItem | null {
  const normalized = pathname === "" ? "/" : pathname;
  const exact = DRAWER_ITEMS.find((item) => normalized === item.route);
  if (exact) return exact;
  const byPrefix = DRAWER_ITEMS
    .filter((item) => item.route !== "/" && normalized.startsWith(`${item.route}/`))
    .sort((a, b) => b.route.length - a.route.length)[0];
  return byPrefix ?? null;
}
