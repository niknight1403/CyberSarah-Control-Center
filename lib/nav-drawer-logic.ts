/**
 * Einheitliches Navigationsmodell für die fünf Produktbereiche.
 * Routen bleiben eigenständig, damit bestehende Deep Links kompatibel sind.
 */
export type DrawerRoute =
  | "/dashboard" | "/business" | "/media-studio" | "/account" | "/chat"
  | "/revenue-os" | "/micro-trading" | "/loop-engineering" | "/focus"
  | "/ideas" | "/decisions" | "/superagent" | "/designer" | "/plugins"
  | "/meetings" | "/cyber-terminal" | "/agent" | "/preview" | "/quality"
  | "/" | "/memory" | "/data" | "/settings" | "/ai-influenza-team" | "/cyber-dashboard";

export type DrawerGroup = "overview" | "growth" | "revenue" | "agent" | "system";

export type DrawerItem = {
  route: DrawerRoute;
  title: string;
  icon:
    | "message.fill" | "wand.and.stars" | "paintpalette.fill" | "puzzlepiece.fill"
    | "video.fill" | "folder.fill" | "brain.head.profile" | "tablecells.fill"
    | "gearshape.fill" | "chevron.left.forwardslash.chevron.right" | "sparkles"
    | "play.rectangle.fill" | "hourglass" | "chart.bar.fill" | "house.fill"
    | "person.crop.circle";
  badge?: string;
  keywords?: readonly string[];
  group: DrawerGroup;
};

/** Alle bisherigen Ziele plus bislang nur über „Mehr“ erreichbare Kernwerkzeuge. */
export const DRAWER_ITEMS: readonly DrawerItem[] = [
  { route: "/dashboard", title: "Übersicht", icon: "house.fill", group: "overview", keywords: ["status", "gesundheit", "betrieb", "startseite"] },
  { route: "/media-studio", title: "Media Studio", icon: "video.fill", group: "growth", keywords: ["videos", "reels", "content", "film", "kampagnen"] },
  { route: "/ai-influenza-team", title: "AI Influenza Team", icon: "sparkles", group: "growth", keywords: ["influencer", "social", "creator", "content", "marketing"] },
  { route: "/revenue-os", title: "Revenue OS", icon: "chart.bar.fill", group: "revenue", keywords: ["umsatz", "stripe", "monetarisierung", "abonnements"] },
  { route: "/business", title: "Business & Kunden", icon: "chart.bar.fill", group: "revenue", keywords: ["crm", "analyse", "kunden", "leads", "statistik"] },
  { route: "/micro-trading", title: "Micro Trading", icon: "chart.bar.fill", group: "system", keywords: ["handel", "markt", "trading"] },
  { route: "/chat", title: "KI-Chat", icon: "message.fill", group: "agent", keywords: ["ki", "assistent", "prompt", "fragen"] },
  { route: "/superagent", title: "Superagent & Workflows", icon: "wand.and.stars", group: "agent", keywords: ["autopilot", "orchestrierung", "workflow"] },
  { route: "/agent", title: "Agenten & Automatisierung", icon: "wand.and.stars", group: "agent", keywords: ["programmierung", "automation", "entwicklung"] },
  { route: "/loop-engineering", title: "Loop Engineering", icon: "gearshape.fill", group: "agent", keywords: ["loops", "verbesserung", "autonomie"] },
  { route: "/focus", title: "Fokus & Rückblick", icon: "hourglass", group: "agent", keywords: ["prioritäten", "aufgaben"] },
  { route: "/ideas", title: "Ideen-Inbox", icon: "sparkles", group: "agent", keywords: ["ideen", "entwurf"] },
  { route: "/decisions", title: "Entscheidungen", icon: "tablecells.fill", group: "agent", keywords: ["entscheidung", "protokoll", "freigaben"] },
  { route: "/", title: "Workspace", icon: "folder.fill", group: "system", keywords: ["dateien", "repository", "github", "code"] },
  { route: "/cyber-dashboard", title: "Cyber Dashboard", icon: "sparkles", group: "system", keywords: ["cyber", "dashboard", "status"] },
  { route: "/preview", title: "Vorschau", icon: "play.rectangle.fill", group: "system", keywords: ["vorschau", "website", "testen"] },
  { route: "/quality", title: "Qualität & Builds", icon: "chart.bar.fill", group: "system", keywords: ["apk", "android", "build", "tests", "release"] },
  { route: "/cyber-terminal", title: "Terminal", icon: "chevron.left.forwardslash.chevron.right", group: "system", keywords: ["logs", "diagnose", "terminal"] },
  { route: "/account", title: "Konto & Einstellungen", icon: "person.crop.circle", group: "system", keywords: ["profil", "einstellungen", "konto"] },
] as const;

/** Exakte Route bevorzugen; danach längstes Eltern-Präfix. */
export function resolveActiveDrawerItem(pathname: string): DrawerItem | null {
  const normalized = pathname === "" ? "/" : pathname;
  const exact = DRAWER_ITEMS.find((item) => normalized === item.route);
  if (exact) return exact;
  const byPrefix = DRAWER_ITEMS
    .filter((item) => item.route !== "/" && normalized.startsWith(`${item.route}/`))
    .sort((a, b) => b.route.length - a.route.length)[0];
  return byPrefix ?? null;
}
