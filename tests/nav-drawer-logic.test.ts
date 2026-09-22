import { describe, expect, it } from "vitest";

import { DRAWER_ITEMS, resolveActiveDrawerItem } from "@/lib/nav-drawer-logic";

describe("DRAWER_ITEMS", () => {
  it("enthaelt genau die neun erwarteten Einträge in Reihenfolge", () => {
    expect(DRAWER_ITEMS.map((item) => item.title)).toEqual([
      "Chat",
      "Revenue OS",
      "Workflows",
      "Designer",
      "Plugins",
      "Meetings",
      "Terminal",
      "Entwicklung",
      "Vorschau",
      "Qualit\u00e4t",
      "Dateien",
      "Gedächtnis",
      "Daten",
      "Agenteneinstellungen",
    ]);
  });

  it("badgt Designer als 'KI', Revenue OS und Meetings als 'Neu'", () => {
    const badged = DRAWER_ITEMS.filter((item) => item.badge);
    expect(badged.map((item) => `${item.title}=${item.badge}`)).toEqual(["Revenue OS=Neu", "Designer=KI", "Meetings=Neu"]);
  });
});

describe("resolveActiveDrawerItem", () => {
  it("findet exakte Treffer", () => {
    expect(resolveActiveDrawerItem("/memory")?.title).toBe("Gedächtnis");
    expect(resolveActiveDrawerItem("/settings")?.title).toBe("Agenteneinstellungen");
    expect(resolveActiveDrawerItem("/revenue-os")?.title).toBe("Revenue OS");
  });

  it("findet Praefix-Treffer fuer verschachtelte Routen", () => {
    expect(resolveActiveDrawerItem("/chat/session-1")?.title).toBe("Chat");
  });

  it("behandelt den Root-Pfad nicht als Praefix fuer andere Routen", () => {
    expect(resolveActiveDrawerItem("/plugins")?.title).toBe("Plugins");
    expect(resolveActiveDrawerItem("")?.title).toBe("Dateien");
    expect(resolveActiveDrawerItem("/")?.title).toBe("Dateien");
  });

  it("liefert null bei unbekannter Route", () => {
    expect(resolveActiveDrawerItem("/unbekannt")).toBeNull();
  });
});
