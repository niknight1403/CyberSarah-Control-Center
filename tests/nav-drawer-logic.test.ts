import { describe, expect, it } from "vitest";

import { DRAWER_ITEMS, resolveActiveDrawerItem } from "@/lib/nav-drawer-logic";

describe("DRAWER_ITEMS", () => {
  it("zeigt fokussierte Revenue-Navigation ohne Designer/Utility-Tabs", () => {
    expect(DRAWER_ITEMS.map((item) => item.title)).toEqual([
      "Übersicht", "Revenue OS", "Business & Analytics", "Micro Trading",
      "Revenue-Loops", "Fokus & Rückblick", "Ideen-Inbox", "Entscheidungs-Journal",
      "Chat", "Workflows", "Konto",
    ]);
    expect(DRAWER_ITEMS.map(item => item.route)).not.toContain("/designer");
    expect(DRAWER_ITEMS.map(item => item.route)).toContain("/focus");
    expect(DRAWER_ITEMS.map(item => item.route)).toContain("/ideas");
    expect(DRAWER_ITEMS.map(item => item.route)).toContain("/decisions");
  });

});

describe("resolveActiveDrawerItem", () => {
  it("findet exakte Treffer", () => {
    expect(resolveActiveDrawerItem("/account")?.title).toBe("Konto");
    expect(resolveActiveDrawerItem("/revenue-os")?.title).toBe("Revenue OS");
    expect(resolveActiveDrawerItem("/micro-trading")?.title).toBe("Micro Trading");
    expect(resolveActiveDrawerItem("/loop-engineering")?.title).toBe("Revenue-Loops");
  });

  it("findet Praefix-Treffer fuer verschachtelte Routen", () => {
    expect(resolveActiveDrawerItem("/chat/session-1")?.title).toBe("Chat");
  });

  it("behandelt den Root-Pfad nicht als Praefix fuer andere Routen", () => {
    expect(resolveActiveDrawerItem("/plugins")).toBeNull();
    expect(resolveActiveDrawerItem("")).toBeNull();
    expect(resolveActiveDrawerItem("/")).toBeNull();
  });

  it("liefert null bei unbekannter Route", () => {
    expect(resolveActiveDrawerItem("/unbekannt")).toBeNull();
  });
});
