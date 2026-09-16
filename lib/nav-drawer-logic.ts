/**
 * Nav-Drawer-Logik (rein, testbar) — Sprint 132.
 *
 * Modell für das seitliche Menü im Base44-Stil (Chat, Workflows, Plugins,
 * Meetings, Dateien, Gedächtnis, Daten, Agenteneinstellungen). Getrennt von
 * lib/viewport-logic.ts (Desktop-Sidebar), weil der Drawer bewusst mehr
 * Einträge zeigt als die kompakte Bottom-Tab-Leiste.
 */

export type DrawerRoute = "/chat" | "/superagent" | "/plugins" | "/meetings" | "/" | "/memory" | "/data" | "/settings";

export type DrawerItem = {
  route: DrawerRoute;
  title: string;
  icon:
    | "message.fill"
    | "wand.and.stars"
    | "puzzlepiece.fill"
    | "video.fill"
    | "folder.fill"
    | "brain.head.profile"
    | "tablecells.fill"
    | "gearshape.fill";
  badge?: string;
};

/** Reihenfolge deckungsgleich mit dem Base44-Vorbild (Chat oben, Settings unten). */
export const DRAWER_ITEMS: readonly DrawerItem[] = [
  { route: "/chat", title: "Chat", icon: "message.fill" },
  { route: "/superagent", title: "Workflows", icon: "wand.and.stars" },
  { route: "/plugins", title: "Plugins", icon: "puzzlepiece.fill" },
  { route: "/meetings", title: "Meetings", icon: "video.fill", badge: "Neu" },
  { route: "/", title: "Dateien", icon: "folder.fill" },
  { route: "/memory", title: "Gedächtnis", icon: "brain.head.profile" },
  { route: "/data", title: "Daten", icon: "tablecells.fill" },
  { route: "/settings", title: "Agenteneinstellungen", icon: "gearshape.fill" },
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
