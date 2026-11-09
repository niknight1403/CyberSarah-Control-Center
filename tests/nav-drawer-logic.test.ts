import { describe, expect, it } from "vitest";
import { DRAWER_ITEMS, resolveActiveDrawerItem } from "@/lib/nav-drawer-logic";

describe("unified five-area navigation", () => {
  it("exposes all destinations previously available through the More dock", () => {
    const routes = DRAWER_ITEMS.map((item) => item.route);
    const required = [
      "/business", "/ai-influenza-team", "/micro-trading", "/loop-engineering",
      "/decisions", "/ideas", "/focus", "/chat", "/cyber-dashboard",
      "/cyber-terminal", "/", "/superagent", "/preview", "/quality",
    ];
    for (const route of required) expect(routes).toContain(route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("uses exactly the five primary information-architecture groups", () => {
    const groups = new Set(["overview", "growth", "revenue", "agent", "system"]);
    expect(DRAWER_ITEMS.every((item) => groups.has(item.group))).toBe(true);
    expect(DRAWER_ITEMS[0].group).toBe("overview");
    expect(DRAWER_ITEMS.find((item) => item.route === "/media-studio")?.group).toBe("growth");
    expect(DRAWER_ITEMS.find((item) => item.route === "/revenue-os")?.group).toBe("revenue");
    expect(DRAWER_ITEMS.find((item) => item.route === "/superagent")?.group).toBe("agent");
    expect(DRAWER_ITEMS.at(-1)?.group).toBe("system");
  });

  it("finds exact and nested routes", () => {
    expect(resolveActiveDrawerItem("/account")?.title).toBe("Konto & Einstellungen");
    expect(resolveActiveDrawerItem("/revenue-os")?.title).toBe("Revenue OS");
    expect(resolveActiveDrawerItem("/chat/session-1")?.title).toBe("KI-Chat");
    expect(resolveActiveDrawerItem("/media-studio")?.title).toBe("Media Studio");
    expect(resolveActiveDrawerItem("/quality/build")?.route).toBe("/quality");
    expect(resolveActiveDrawerItem("/ai-influenza-team/campaigns")?.route).toBe("/ai-influenza-team");
  });

  it("keeps root exact and leaves unknown or intentionally non-prominent routes alone", () => {
    expect(resolveActiveDrawerItem("")?.route).toBe("/");
    expect(resolveActiveDrawerItem("/")?.route).toBe("/");
    expect(resolveActiveDrawerItem("/plugins")).toBeNull();
    expect(resolveActiveDrawerItem("/designer")).toBeNull();
    expect(resolveActiveDrawerItem("/not-found")).toBeNull();
  });
});
