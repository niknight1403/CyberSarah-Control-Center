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
  | "/account"
  | "/chat"
  | "/revenue-os"
  | "/micro-trading"
  | "/loop-engineering"
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
    | "chart.bar.fill";
  badge?: string;
};

/** Reihenfolge deckungsgleich mit dem Base44-Vorbild (Chat oben, Settings unten). */
/** Operatives Menü: Revenue zuerst, Admin- und Utility-Routen bleiben direkt erreichbar. */
export const DRAWER_ITEMS: readonly DrawerItem[] = [
  { route: "/dashboard", title: "Übersicht", icon: "chart.bar.fill" },
  { route: "/revenue-os", title: "Revenue OS", icon: "chart.bar.fill" },
  { route: "/business", title: "Business & Analytics", icon: "chart.bar.fill" },
  { route: "/micro-trading", title: "Micro Trading", icon: "chart.bar.fill", badge: "Read-only" },
  { route: "/loop-engineering", title: "Revenue-Loops", icon: "wand.and.stars" },
  { route: "/chat", title: "Chat", icon: "message.fill" },
  { route: "/superagent", title: "Workflows", icon: "wand.and.stars" },
  { route: "/account", title: "Konto", icon: "gearshape.fill" },
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
