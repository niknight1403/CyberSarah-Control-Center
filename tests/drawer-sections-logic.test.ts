import { describe, expect, it } from "vitest";
import { DRAWER_ITEMS } from "@/lib/nav-drawer-logic";
import { filterDrawerItems } from "@/lib/drawer-search-logic";
import { DRAWER_SECTIONS, groupDrawerItems } from "@/lib/drawer-sections-logic";

describe("five primary drawer sections", () => {
  it("preserves the five-area order and every unique destination", () => {
    const result = groupDrawerItems(DRAWER_ITEMS);
    expect(result.map((x) => x.key)).toEqual(["overview", "growth", "revenue", "agent", "system"]);
    expect(result.map((x) => x.key)).toEqual(DRAWER_SECTIONS.map((x) => x.key));
    const groupedItems = result.flatMap((x) => x.items);
    expect(groupedItems).toHaveLength(DRAWER_ITEMS.length);
    expect(new Set(groupedItems.map((item) => item.route)).size).toBe(DRAWER_ITEMS.length);
    expect(groupedItems.map((item) => item.route).sort()).toEqual(DRAWER_ITEMS.map((item) => item.route).sort());
  });

  it("filters to the relevant product area", () => {
    const result = groupDrawerItems(filterDrawerItems("influenza"));
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("growth");
    expect(result[0].items[0].route).toBe("/ai-influenza-team");
  });

  it("omits empty sections when there are no matches", () => {
    expect(groupDrawerItems([])).toEqual([]);
    expect(groupDrawerItems(filterDrawerItems("zzz-unbekannt"))).toEqual([]);
  });
});
