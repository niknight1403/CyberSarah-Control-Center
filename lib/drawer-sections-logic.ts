import type { DrawerItem } from "./nav-drawer-logic";

export const DRAWER_SECTIONS: readonly {
  key: DrawerItem["group"];
  title: string;
}[] = [
  { key: "start", title: "SCHNELLSTART" },
  { key: "revenue", title: "GESCHÄFT & UMSATZ" },
  { key: "studio", title: "CONTENT STUDIO" },
  { key: "development", title: "ENTWICKLUNG" },
  { key: "system", title: "SYSTEM" },
] as const;

export type VisibleDrawerSection = {
  key: DrawerItem["group"];
  title: string;
  items: DrawerItem[];
};

/** Preserves section and item order; omits empty sections when filtering. */
export function groupDrawerItems(items: readonly DrawerItem[]): VisibleDrawerSection[] {
  return DRAWER_SECTIONS
    .map(({ key, title }) => ({
      key,
      title,
      items: items.filter((item) => item.group === key),
    }))
    .filter((section) => section.items.length > 0);
}
