import { DRAWER_ITEMS, type DrawerRoute } from "./nav-drawer-logic";

export const RECENT_DRAWER_STORAGE_KEY = "cybersarah:recent-drawer-routes:v1";
export const MAX_RECENT_DRAWER_ROUTES = 5;

const KNOWN_ROUTES = new Set<string>(DRAWER_ITEMS.map((item) => item.route));

/** Only allow known in-app navigation targets; drop duplicates and stale routes. */
export function sanitizeRecentRoutes(value: unknown): DrawerRoute[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const routes: DrawerRoute[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !KNOWN_ROUTES.has(item) || seen.has(item)) continue;
    seen.add(item);
    routes.push(item as DrawerRoute);
    if (routes.length >= MAX_RECENT_DRAWER_ROUTES) break;
  }
  return routes;
}

export function parseRecentRoutes(raw: string | null): DrawerRoute[] {
  if (!raw) return [];
  try {
    return sanitizeRecentRoutes(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Recent routes are most-recent-first, without allowing arbitrary URLs. */
export function recordRecentRoute(current: readonly DrawerRoute[], route: string): DrawerRoute[] {
  if (!KNOWN_ROUTES.has(route)) return sanitizeRecentRoutes(current);
  return sanitizeRecentRoutes([route, ...current]);
}
