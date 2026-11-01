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

  it("findet funktionale Kurzbegriffe statt nur technischer Routennamen", () => {
    expect(filterDrawerItems("APK").map((item) => item.route)).toEqual(["/quality"]);
    expect(filterDrawerItems("github").map((item) => item.route)).toEqual(["/"]);
    expect(filterDrawerItems("stripe").map((item) => item.route)).toEqual(["/revenue-os"]);
    expect(filterDrawerItems("programmierung").map((item) => item.route)).toEqual(["/agent"]);
  });

  it("behandelt Trennzeichen, Diakritika und Grossschreibung robust", () => {
    expect(normalizeDrawerSearch("  CYBER_terminal  ")).toBe("cyber terminal");
    expect(normalizeDrawerSearch("GRÜN / BLAU")).toBe("grun blau");
    expect(normalizeDrawerSearch("ẞ")).toBe("ss");
    expect(filterDrawerItems("cyber terminal").map((item) => item.route)).toEqual(["/cyber-terminal"]);
    expect(filterDrawerItems("Media-Studio").map((item) => item.route)).toEqual(["/media-studio"]);
  });

  it("veraendert weder Menuepunkte noch deren Anordnung", () => {
    const items = [...DRAWER_ITEMS];
    filterDrawerItems("status", items);
    expect(items).toEqual(DRAWER_ITEMS);
  });
});
