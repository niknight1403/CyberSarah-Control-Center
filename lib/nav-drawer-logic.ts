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
  group: "start" | "revenue" | "studio" | "development" | "system";
};

/** Reihenfolge deckungsgleich mit dem Base44-Vorbild (Chat oben, Settings unten). */
/** Operatives Menü: Revenue zuerst, Admin- und Utility-Routen bleiben direkt erreichbar. */
export const DRAWER_ITEMS: readonly DrawerItem[] = [
  { route: "/dashboard", title: "Übersicht", icon: "chart.bar.fill", group: "start" },
  { route: "/chat", title: "KI-Chat", icon: "message.fill", group: "start" },
  { route: "/superagent", title: "Superagent & Workflows", icon: "wand.and.stars", group: "start" },
  { route: "/revenue-os", title: "Revenue OS", icon: "chart.bar.fill", group: "revenue" },
  { route: "/business", title: "Business & Analytics", icon: "chart.bar.fill", group: "revenue" },
  { route: "/focus", title: "Fokus & Rückblick", icon: "hourglass", group: "revenue" },
  { route: "/ideas", title: "Ideen-Inbox", icon: "sparkles", group: "revenue" },
  { route: "/decisions", title: "Entscheidungen", icon: "tablecells.fill", group: "revenue" },
  { route: "/media-studio", title: "Media Studio", icon: "video.fill", group: "studio" },
  { route: "/agent", title: "Agenten & Automatisierung", icon: "wand.and.stars", group: "development" },
  { route: "/", title: "Workspace", icon: "folder.fill", group: "development" },
  { route: "/preview", title: "Vorschau", icon: "play.rectangle.fill", group: "development" },
  { route: "/quality", title: "Qualität & Builds", icon: "chart.bar.fill", group: "development" },
  { route: "/cyber-terminal", title: "Terminal", icon: "chevron.left.forwardslash.chevron.right", group: "development" },
  { route: "/account", title: "Konto & Einstellungen", icon: "gearshape.fill", group: "system" },
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
