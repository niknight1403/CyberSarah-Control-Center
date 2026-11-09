/**
 * Nav-Drawer-Logik (rein, testbar) — Sprint 132.
 *
 * Einheitliches Fünf-Bereiche-Modell für den Navigations-Drawer.
 * Bestehende Expo-Routen bleiben eigenständige Ziele; dieses Modell ordnet
 * sie nur nach Produktaufgabe und ändert keine Deep Links oder Berechtigungen.
 */

export type DrawerRoute =
  | "/dashboard"
  | "/cyber-dashboard"
  | "/ai-influenza-team"
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
  keywords?: readonly string[];
  group: "overview" | "growth" | "revenue" | "agent" | "system";
};

/** Fünf Produktbereiche; alle bestehenden Kernziele bleiben direkt erreichbar. */
export const DRAWER_ITEMS: readonly DrawerItem[] = [
  { route: "/dashboard", title: "Übersicht", icon: "chart.bar.fill", group: "overview", keywords: ["status","gesundheit","betrieb","startseite"] },
  { route: "/cyber-dashboard", title: "Cyber Dashboard", icon: "sparkles", group: "overview", keywords: ["kennzahlen","cockpit","status"] },
  { route: "/media-studio", title: "Media Studio", icon: "video.fill", group: "growth", keywords: ["videos","reels","content","film","kampagnen"] },
  { route: "/ai-influenza-team", title: "AI Influenza Team", icon: "sparkles", group: "growth", keywords: ["content","social media","marketing","creator"] },
  { route: "/revenue-os", title: "Revenue OS", icon: "chart.bar.fill", group: "revenue", keywords: ["umsatz","geld","stripe","monetarisierung","abonnements"] },
  { route: "/business", title: "Business & Kunden", icon: "tablecells.fill", group: "revenue", keywords: ["analyse","kunden","crm","leads","statistik"] },
  { route: "/micro-trading", title: "Micro Trading", icon: "chart.bar.fill", group: "revenue", keywords: ["handel","portfolio"] },
  { route: "/chat", title: "KI-Chat", icon: "message.fill", group: "agent", keywords: ["ki","assistent","prompt","fragen"] },
  { route: "/superagent", title: "Superagent & Workflows", icon: "wand.and.stars", group: "agent", keywords: ["autopilot","orchestrierung","workflow"] },
  { route: "/agent", title: "Agenten & Automatisierung", icon: "wand.and.stars", group: "agent", keywords: ["programmierung","automation","entwicklung"] },
  { route: "/loop-engineering", title: "Loop Engineering", icon: "wand.and.stars", group: "agent", keywords: ["loops","selbstoptimierung","automation"] },
  { route: "/focus", title: "Fokus & Rückblick", icon: "hourglass", group: "agent", keywords: ["prioritaeten","aufgaben"] },
  { route: "/ideas", title: "Ideen-Inbox", icon: "sparkles", group: "agent", keywords: ["ideen","entwurf"] },
  { route: "/decisions", title: "Entscheidungen", icon: "tablecells.fill", group: "agent", keywords: ["entscheidung","protokoll"] },
  { route: "/", title: "Workspace", icon: "folder.fill", group: "system", keywords: ["dateien","repository","github","code"] },
  { route: "/preview", title: "Vorschau", icon: "play.rectangle.fill", group: "system", keywords: ["vorschau","website","testen"] },
  { route: "/quality", title: "Qualität & Builds", icon: "chart.bar.fill", group: "system", keywords: ["apk","android","build","tests","release"] },
  { route: "/cyber-terminal", title: "Terminal", icon: "chevron.left.forwardslash.chevron.right", group: "system", keywords: ["logs","diagnose","terminal"] },
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
