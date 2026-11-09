import type { IconSymbolName } from "@/components/ui/icon-symbol";

export type NavigationItem = {
  route: string;
  title: string;
  icon: IconSymbolName;
};

/** Die fünf Hauptbereiche sind auf Desktop identisch zur mobilen Tab-Bar. */
export const PRIMARY_NAV_ITEMS: NavigationItem[] = [
  { route: "/dashboard", title: "Übersicht", icon: "house.fill" },
  { route: "/media-studio", title: "Wachstum & Content", icon: "video.fill" },
  { route: "/revenue-os", title: "Umsatz & Kunden", icon: "chart.bar.fill" },
  { route: "/agent", title: "KI-Agent", icon: "wand.and.stars" },
  { route: "/account", title: "Konto & System", icon: "person.crop.circle" },
];

export function getPrimaryNavigation(): NavigationItem[] {
  return [...PRIMARY_NAV_ITEMS];
}

export function matchesRoute(pathname: string, route: string): boolean {
  if (route === "/") return pathname === "/" || pathname.endsWith("/index");
  return pathname === route || pathname.startsWith(`${route}/`);
}

export type ServerHealth = "checking" | "online" | "offline";
export type SidebarFooterStatus = {
  label: string;
  tone: "positive" | "negative" | "muted";
};

export function resolveSidebarFooter(health: ServerHealth): SidebarFooterStatus {
  if (health === "online") return { label: "SERVER ERREICHBAR", tone: "positive" };
  if (health === "offline") return { label: "SERVER OFFLINE", tone: "negative" };
  return { label: "SERVER PRÜFT…", tone: "muted" };
}
