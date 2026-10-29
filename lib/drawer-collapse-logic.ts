import type { DrawerItem } from "./nav-drawer-logic";

type DrawerGroup = DrawerItem["group"];

export type DrawerCollapseState = Partial<Record<DrawerGroup, boolean>>;

/** Toggle only the chosen group; never mutate the existing navigation state. */
export function toggleDrawerSection(state: DrawerCollapseState, group: DrawerGroup): DrawerCollapseState {
  return { ...state, [group]: !state[group] };
}

/**
 * Search results always expand relevant groups, even if users collapsed them.
 * Clearing the search restores the user's collapsed preferences.
 */
export function isDrawerSectionCollapsed(
  state: DrawerCollapseState,
  group: DrawerGroup,
  search: string,
): boolean {
  if (search.trim().length > 0) return false;
  return state[group] === true;
}
