/**
 * Sprint 344 — Navigation-Pass: reine, deterministische Logik fuer
 * Zurueck-Verhalten, Deep-Links und Tab-Zustand.
 *
 * Datenfluss:
 *   Jeder Tab hat EIGENEN Routen-Stack; die globale Tab-Historie
 *   merkt, welcher Tab zuletzt aktiv war. Hardware-Zurueck popped
 *   zuerst im Tab, wechselt sonst zum vorherigen Tab und beendet die
 *   App erst am Anfang der Historie — Tab-Zustand geht NIE verloren.
 *
 * Ehrlichkeits-Grenze: Ein unbekannter Deep-Link wird NICHT still auf
 *   eine Startseite umgeleitet, sondern mit klarer Meldung abgelehnt
 *   (Zustand bleibt, wie er war). Deep-Links uebernehmen nie still-
 *   schweigend einen anderen Tab-Zustand.
 */

export type TabId = string;
export type Route = string; // z. B. "/chat", "/chat/42"

export type NavigationState = {
  /** Je Tab: Stack von Routen (Index 0 = Tab-Wurzel). */
  tabStacks: Record<TabId, Route[]>;
  activeTab: TabId;
  /** Reihenfolge der zuletzt aktiven Tabs (hinten = zuletzt). */
  tabHistory: TabId[];
};

export const HOME_TAB: TabId = "chat";

/** Route -> Tab-Zuordnung: laengster passender Tab-Wurzelprefix gewinnt. */
export function tabForRoute(route: Route, tabRoots: Record<TabId, Route>): TabId | null {
  let best: { tab: TabId; len: number } | null = null;
  for (const [tab, root] of Object.entries(tabRoots)) {
    if (route === root || route.startsWith(`${root}/`)) {
      if (!best || root.length > best.len) best = { tab, len: root.length };
    }
  }
  return best?.tab ?? null;
}

/** Frischer Navigations-Zustand: jeder Tab startet auf seiner Wurzel. */
export function createNavigationState(tabRoots: Record<TabId, Route>): NavigationState {
  const tabStacks = Object.fromEntries(Object.entries(tabRoots).map(([tab, root]) => [tab, [root]]));
  const tabs = Object.keys(tabRoots);
  return { tabStacks, activeTab: HOME_TAB in tabStacks ? HOME_TAB : tabs[0], tabHistory: [] };
}

/** Aktiv-Tab wechseln: Stack des alten Tabs bleibt unberuehrt erhalten. */
export function switchTab(state: NavigationState, tab: TabId): NavigationState {
  if (tab === state.activeTab || !(tab in state.tabStacks)) return state;
  const history = [...state.tabHistory.filter((t) => t !== state.activeTab), state.activeTab];
  return { ...state, activeTab: tab, tabHistory: history.slice(-10) };
}

/** Route oeffnen: im aktiven Tab pushen oder (bei anderem Tab) Tab wechseln + push. */
export function navigate(
  state: NavigationState,
  route: Route,
  tabRoots: Record<TabId, Route>,
): { state: NavigationState; notice: string | null } {
  const tab = tabForRoute(route, tabRoots);
  if (tab === null) {
    return { state, notice: `Route "${route}" ist unbekannt — Navigation NICHT ausgefuehrt.` };
  }
  let next = state;
  if (tab !== state.activeTab) next = switchTab(next, tab);
  const stack = next.tabStacks[next.activeTab];
  const top = stack[stack.length - 1];
  if (top === route) return { state: next, notice: null }; // doppelt: kein Push
  const tabStacks = { ...next.tabStacks, [next.activeTab]: [...stack, route] };
  return { state: { ...next, tabStacks }, notice: null };
}

/** Ehrliche Zurueck-Entscheidung: pop im Tab -> Tab zurueck -> App beenden. */
export function decideBack(state: NavigationState): {
  action: "pop" | "tab-zurueck" | "app-beenden";
  target: Route | TabId | null;
  nextState: NavigationState;
} {
  const stack = state.tabStacks[state.activeTab];
  if (stack.length > 1) {
    const popped = [...stack.slice(0, -1)];
    return {
      action: "pop",
      target: popped[popped.length - 1],
      nextState: { ...state, tabStacks: { ...state.tabStacks, [state.activeTab]: popped } },
    };
  }
  const previousTab = state.tabHistory[state.tabHistory.length - 1];
  if (previousTab && previousTab !== state.activeTab) {
    const history = state.tabHistory.slice(0, -1);
    return { action: "tab-zurueck", target: previousTab, nextState: { ...state, activeTab: previousTab, tabHistory: history } };
  }
  return { action: "app-beenden", target: null, nextState: state };
}

export type DeepLink = { route: Route; params: Record<string, string> };

/** Deep-Link parsen: cyber-sarah://chat/42?draft=abc oder https-Form. */
export function parseDeepLink(url: string): DeepLink | null {
  // HTTPS-Form zuerst: Host wird weggeschnitten, nur der Pfad zaehlt.
  const m =
    url.match(/^https?:\/\/[^/]+\/([^\?#]*)(?:\?(.*))?$/i) ??
    url.match(/^[a-z][a-z0-9+.-]*:\/\/([^\?#]*)(?:\?(.*))?$/i);
  if (!m) return null;
  const path = m[1].replace(/\/+$/, "");
  if (!path) return null;
  const params: Record<string, string> = {};
  if (m[2]) {
    for (const pair of m[2].split("&")) {
      const [k, v = ""] = pair.split("=");
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  return { route: `/${path}`, params };
}

/** Deep-Link gegen bekannte Tabs pruefen — unbekannt bleibt unveraendert. */
export function applyDeepLink(
  state: NavigationState,
  link: DeepLink,
  tabRoots: Record<TabId, Route>,
): { state: NavigationState; notice: string | null } {
  const tab = tabForRoute(link.route, tabRoots);
  if (tab === null) {
    return { state, notice: `Deep-Link auf "${link.route}" ist unbekannt — NICHT navigiert, Zustand bleibt.` };
  }
  const result = navigate(state, link.route, tabRoots);
  return { state: result.state, notice: result.notice };
}

/** Aktuelle Route des aktiven Tabs (fuer Header, Zurueck-Sichtbarkeit). */
export function currentRoute(state: NavigationState): Route {
  const stack = state.tabStacks[state.activeTab];
  return stack[stack.length - 1];
}

/** Kann man im aktiven Tab zurueck (fuer sichtbaren Zurueck-Pfeil)? */
export function canGoBackWithinTab(state: NavigationState): boolean {
  return state.tabStacks[state.activeTab].length > 1;
}
