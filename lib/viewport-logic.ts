/**
 * Viewport-Logik (rein, testbar): Breakpoints und Navigations-Modell für das
 * responsive Layout. Auf Viewports ab Tablet-Breite ersetzt eine Sidebar die
 * mobile Bottom-Tab-Navigation.
 */

export const VIEWPORT_BREAKPOINTS = {
  /** Ab dieser Breite (px) wird die Sidebar statt der Bottom-Tabs gezeigt. */
  tablet: 768,
  desktop: 1200,
} as const;

export function isWideViewport(width: number): boolean {
  return width >= VIEWPORT_BREAKPOINTS.tablet;
}

export function isDesktopViewport(width: number): boolean {
  return width >= VIEWPORT_BREAKPOINTS.desktop;
}

export type SidebarRoute =
  | "/"
  | "/chat"
  | "/agent"
  | "/preview"
  | "/quality"
  | "/account"
  | "/settings";

export type SidebarItem = {
  route: SidebarRoute;
  title: string;
  icon: "folder.fill" | "message.fill" | "sparkles" | "play.rectangle.fill" | "chart.bar.fill" | "person.crop.circle" | "gearshape.fill";
};

/** Navigations-Items der Sidebar — Deckungsgleich mit den Tab-Routen plus Einstellungen. */
export const SIDEBAR_ITEMS: readonly SidebarItem[] = [
  { route: "/", title: "Workspace", icon: "folder.fill" },
  { route: "/chat", title: "Chat", icon: "message.fill" },
  { route: "/agent", title: "Agent", icon: "sparkles" },
  { route: "/preview", title: "Vorschau", icon: "play.rectangle.fill" },
  { route: "/quality", title: "Qualität", icon: "chart.bar.fill" },
  { route: "/account", title: "Konto", icon: "person.crop.circle" },
  { route: "/settings", title: "Einstellungen", icon: "gearshape.fill" },
] as const;

/** Aktives Item anhand des Pfades auflösen ("/chat/…" → Chat). */
export function resolveActiveSidebarItem(pathname: string): SidebarItem | null {
  const normalized = pathname === "" ? "/" : pathname;
  const exact = SIDEBAR_ITEMS.find((item) => normalized === item.route);
  if (exact) return exact;
  const byPrefix = SIDEBAR_ITEMS
    .filter((item) => item.route !== "/" && normalized.startsWith(`${item.route}/`))
    .sort((a, b) => b.route.length - a.route.length)[0];
  return byPrefix ?? null;
}
