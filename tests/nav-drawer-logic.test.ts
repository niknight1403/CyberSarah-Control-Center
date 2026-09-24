import { describe, expect, it } from "vitest";

import { DRAWER_ITEMS, resolveActiveDrawerItem } from "@/lib/nav-drawer-logic";

describe("DRAWER_ITEMS", () => {
  it("enthaelt genau die erwarteten Einträge in Reihenfolge", () => {
    expect(DRAWER_ITEMS.map((item) => item.title)).toEqual([
      "Chat",
      "Revenue OS",
      "Micro Trading",
      "Loop Engineering",
      "Fokus & Rückblick",
      "Ideen-Inbox",
      "Entscheidungs-Journal",
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

  it("badgt die neuen Revenue-Einträge und Systembereiche", () => {
    const badged = DRAWER_ITEMS.filter((item) => item.badge);
    expect(badged.map((item) => `${item.title}=${item.badge}`)).toEqual(["Revenue OS=Neu", "Micro Trading=Paper", "Loop Engineering=Umsatz", "Fokus & Rückblick=Neu", "Ideen-Inbox=Neu", "Designer=KI", "Meetings=Neu"]);
  });
});

describe("resolveActiveDrawerItem", () => {
  it("findet exakte Treffer", () => {
    expect(resolveActiveDrawerItem("/memory")?.title).toBe("Gedächtnis");
    expect(resolveActiveDrawerItem("/settings")?.title).toBe("Agenteneinstellungen");
    expect(resolveActiveDrawerItem("/revenue-os")?.title).toBe("Revenue OS");
    expect(resolveActiveDrawerItem("/micro-trading")?.title).toBe("Micro Trading");
    expect(resolveActiveDrawerItem("/loop-engineering")?.title).toBe("Loop Engineering");
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
