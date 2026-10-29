import { describe, expect, it } from "vitest";
import { DRAWER_ITEMS } from "@/lib/nav-drawer-logic";
import { filterDrawerItems, normalizeDrawerSearch } from "@/lib/drawer-search-logic";

describe("mobile drawer search", () => {
  it("normalisiert Schreibweisen, Grossbuchstaben und Leerzeichen", () => {
    expect(normalizeDrawerSearch("  ÜBERSICHT  ")).toBe("ubersicht");
    expect(normalizeDrawerSearch("Straße  der  Ideen")).toBe("strasse der ideen");
  });

  it("bewahrt bei leerer Eingabe die volle Reihenfolge", () => {
    expect(filterDrawerItems("")).toEqual(DRAWER_ITEMS);
    expect(filterDrawerItems("  ")).toEqual(DRAWER_ITEMS);
    expect(filterDrawerItems("")).not.toBe(DRAWER_ITEMS);
  });

  it("findet Begriffe in Titeln und technischen Routen", () => {
    expect(filterDrawerItems("ubersicht").map((x) => x.route)).toContain("/dashboard");
    expect(filterDrawerItems("media studio").map((x) => x.route)).toEqual(["/media-studio"]);
    expect(filterDrawerItems("cyber-terminal").map((x) => x.route)).toEqual(["/cyber-terminal"]);
  });

  it("verknuepft mehrere Suchwoerter und zeigt ehrlich keine Treffer", () => {
    expect(filterDrawerItems("agenten automatisierung").map((x) => x.route)).toEqual(["/agent"]);
    expect(filterDrawerItems("keine-route-12345")).toEqual([]);
  });

  it("veraendert weder Menuepunkte noch deren Anordnung", () => {
    const items = [...DRAWER_ITEMS];
    filterDrawerItems("status", items);
    expect(items).toEqual(DRAWER_ITEMS);
  });
});
