import type { IconSymbolName } from "@/components/ui/icon-symbol";

/**
 * Sprint 200 — Dual-Sidebar-Logik (rein, deterministisch testbar).
 *
 * Die Wide-Viewport-Navigation (components/responsive/dual-sidebar.tsx)
 * gliedert sich in zwei Zonen: Apps Operations und Superagent Command.
 * Diese Bibliothek entscheidet rein:
 *   - welcher Sidebar-Eintrag zur aktuellen Route aktiv ist
 *   - welcher ehrliche Status-Text/Farbton der Footer je Zone und
 *     Server-Erreichbarkeit zeigt (kein Fake-„SYSTEM ONLINE")
 * Sie kennt kein React, kein Netz, kein Theme — alles deterministisch.
 */

export type SidebarZone = "apps" | "superagent";

export type NavigationItem = {
  route: string;
  title: string;
  icon: IconSymbolName;
};

export const APPS_ITEMS: NavigationItem[] = [
  { route: "/dashboard", title: "Übersicht", icon: "house.fill" },
  { route: "/", title: "Workspace", icon: "folder.fill" },
  { route: "/cyber-dashboard", title: "Cyber Dashboard", icon: "bolt.fill" },
  { route: "/business", title: "Business & Analytics", icon: "chart.bar.fill" },
  { route: "/cyber-terminal", title: "Terminal", icon: "chevron.left.forwardslash.chevron.right" },
  { route: "/data", title: "Daten-Hub", icon: "tablecells.fill" },
  { route: "/meetings", title: "Meetings", icon: "gearshape.fill" },
  // Sprint 200: auf Wide-Viewports ist die Tab-Bar ausgeblendet — ohne
  // diesen Eintrag waere der Konto-Screen dort unerreichbar.
  { route: "/account", title: "Konto", icon: "person.crop.circle" },
];

export const SUPERAGENT_ITEMS: NavigationItem[] = [
  { route: "/superagent", title: "Command Center", icon: "wand.and.stars" },
  { route: "/agent", title: "Development Agent", icon: "sparkles" },
  { route: "/chat", title: "Agent Chat", icon: "message.fill" },
  { route: "/quality", title: "Quality & Runs", icon: "checkmark.circle.fill" },
  { route: "/preview", title: "Live Preview", icon: "play.rectangle.fill" },
];

/** Liefert die Navigationseintraege einer Zone (Kopie, nicht die Referenz). */
export function getSidebarItems(zone: SidebarZone): NavigationItem[] {
  return [...(zone === "apps" ? APPS_ITEMS : SUPERAGENT_ITEMS)];
}

/**
 * Wahr, wenn die Sidebar-Zone (oder der Sidebar-Footer) fuer die Route
 * aktiv sein soll. "/" deckt dabei auch expo-routers "index"-Segment ab;
 * jede andere Route matcht exakt oder als Eltern-Praefix ("/chat/42").
 */
export function matchesRoute(pathname: string, route: string): boolean {
  if (route === "/") return pathname === "/" || pathname.endsWith("/index");
  return pathname === route || pathname.startsWith(`${route}/`);
}

/* ==================== Ehrlicher Footer-Status ==================== */

/** Beobachteter Server-Zustand der Sidebar (aus echtem /api/health-Poll). */
export type ServerHealth = "checking" | "online" | "offline";

export type SidebarFooterStatus = {
  /** Sichtbarer Footer-Text (bewusst kurz, Uppercase rendert der Style). */
  label: string;
  /** Farbton des Statuspunkts und Texts: positive / negative / muted. */
  tone: "positive" | "negative" | "muted";
};

/**
 * Leitet den ehrlichen Footer-Status je Zone und Server-Zustand ab.
 * Kein Zustand behauptet mehr als beobachtet wurde: "ERREICHBAR" meint
 * genau die Erreichbarkeit des App-Servers (/api/health, 200) — nicht
 * Orchestrator-Readiness, DB-Verfuegbarkeit oder Provider-Konfiguration.
 */
export function resolveSidebarFooter(zone: SidebarZone, health: ServerHealth): SidebarFooterStatus {
  const label =
    health === "online"
      ? zone === "apps"
        ? "SYSTEM ONLINE"
        : "ORCHESTRATOR ERREICHBAR"
      : health === "offline"
        ? zone === "apps"
          ? "SYSTEM OFFLINE"
          : "ORCHESTRATOR OFFLINE"
        : zone === "apps"
          ? "SYSTEM PRÜFT…"
          : "ORCHESTRATOR PRÜFT…";
  const tone: SidebarFooterStatus["tone"] = health === "online" ? "positive" : health === "offline" ? "negative" : "muted";
  return { label, tone };
}
