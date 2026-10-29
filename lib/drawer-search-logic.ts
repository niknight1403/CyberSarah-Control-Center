import { DRAWER_ITEMS, type DrawerItem } from "./nav-drawer-logic";

/** Stateless filter: results never depend on a previous query. */
export function normalizeDrawerSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLocaleLowerCase("de")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Multi-word search checks title, route and section metadata.
 * A blank query always returns the original menu order.
 */
export function filterDrawerItems(
  search: string,
  items: readonly DrawerItem[] = DRAWER_ITEMS,
): DrawerItem[] {
  const query = normalizeDrawerSearch(search);
  if (!query) return [...items];
  const words = query.split(" ");
  return items.filter((item) => {
    const haystack = normalizeDrawerSearch(
      [item.title, item.route, item.group, item.badge ?? ""].join(" "),
    );
    return words.every((word) => haystack.includes(word));
  });
}
