import { describe, expect, it } from "vitest";
import { DRAWER_ITEMS } from "@/lib/nav-drawer-logic";
import { filterDrawerItems } from "@/lib/drawer-search-logic";
import { DRAWER_SECTIONS, groupDrawerItems } from "@/lib/drawer-sections-logic";

describe("mobile drawer sections", () => {
  it("liefert immer die festgelegte Reihenfolge ohne Duplikate", () => {
    const result = groupDrawerItems(DRAWER_ITEMS);
    expect(result.map((x) => x.key)).toEqual(DRAWER_SECTIONS.map((x) => x.key));
    expect(result.flatMap((x) => x.items)).toEqual(DRAWER_ITEMS);
  });

  it("zeigt bei Suche nur Gruppen mit Treffern", () => {
    const result = groupDrawerItems(filterDrawerItems("media"));
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("studio");
    expect(result[0].items[0].route).toBe("/media-studio");
  });

  it("behandelt den Nulltrefferfall ohne leere Kategorieueberschriften", () => {
    expect(groupDrawerItems([])).toEqual([]);
    expect(groupDrawerItems(filterDrawerItems("zzz-unbekannt"))).toEqual([]);
  });
});
