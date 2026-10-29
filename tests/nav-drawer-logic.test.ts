import { describe, expect, it } from "vitest";
import { DRAWER_ITEMS, resolveActiveDrawerItem } from "@/lib/nav-drawer-logic";

describe("mobile drawer navigation", () => {
  it("macht die Kernbereiche und bisher versteckten Entwicklungswerkzeuge erreichbar", () => {
    const routes = DRAWER_ITEMS.map((item) => item.route);
    expect(routes).toEqual([
      "/dashboard", "/chat", "/superagent",
      "/revenue-os", "/business", "/focus", "/ideas", "/decisions",
      "/media-studio",
      "/agent", "/", "/preview", "/quality", "/cyber-terminal",
      "/account",
    ]);
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes).not.toContain("/designer");
  });

  it("weist jedem Menuepunkt eine gueltige Gruppe zu", () => {
    const groups = new Set(["start", "revenue", "studio", "development", "system"]);
    expect(DRAWER_ITEMS.every((item) => groups.has(item.group))).toBe(true);
    expect(DRAWER_ITEMS[0].group).toBe("start");
    expect(DRAWER_ITEMS.at(-1)?.group).toBe("system");
  });

  it("findet exakte und verschachtelte Routen", () => {
    expect(resolveActiveDrawerItem("/account")?.title).toBe("Konto & Einstellungen");
    expect(resolveActiveDrawerItem("/revenue-os")?.title).toBe("Revenue OS");
    expect(resolveActiveDrawerItem("/chat/session-1")?.title).toBe("KI-Chat");
    expect(resolveActiveDrawerItem("/media-studio")?.title).toBe("Media Studio");
    expect(resolveActiveDrawerItem("/quality/build")?.route).toBe("/quality");
  });

  it("behandelt Root nur als exakten Treffer und laesst unbekannte Routen in Ruhe", () => {
    expect(resolveActiveDrawerItem("")?.route).toBe("/");
    expect(resolveActiveDrawerItem("/")?.route).toBe("/");
    expect(resolveActiveDrawerItem("/plugins")).toBeNull();
    expect(resolveActiveDrawerItem("/micro-trading")).toBeNull();
    expect(resolveActiveDrawerItem("/not-found")).toBeNull();
  });
});
