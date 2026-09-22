import { describe, expect, it } from "vitest";

import { APPS_ITEMS, SUPERAGENT_ITEMS, getSidebarItems, matchesRoute, resolveSidebarFooter } from "../lib/dual-sidebar-logic";

describe("dual sidebar logic (Sprint 200)", () => {
  it("matcht Routen exakt, als Eltern-Praefix und erkennt index", () => {
    expect(matchesRoute("/chat", "/chat")).toBe(true);
    expect(matchesRoute("/chat/42", "/chat")).toBe(true);
    expect(matchesRoute("/chatzeugs", "/chat")).toBe(false);
    expect(matchesRoute("/", "/")).toBe(true);
    expect(matchesRoute("/(tabs)/index", "/")).toBe(true);
    expect(matchesRoute("/dashboard", "/")).toBe(false);
    expect(matchesRoute("/dashboard", "/dashboard")).toBe(true);
    expect(matchesRoute("/dashboard/neu", "/dashboard")).toBe(true);
    expect(matchesRoute("/account", "/dashboard")).toBe(false);
  });

  it("haelt alle Eintraege jeder Zone konsistent (Route, Titel, Icon)", () => {
    for (const items of [APPS_ITEMS, SUPERAGENT_ITEMS]) {
      expect(items.length).toBeGreaterThan(0);
      const routes = items.map((item) => item.route);
      expect(new Set(routes).size).toBe(routes.length);
      for (const item of items) {
        expect(item.route.startsWith("/")).toBe(true);
        expect(item.title.trim().length).toBeGreaterThan(0);
        expect(item.icon.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("erreichbarkeits-Regression: Konto ist auch ohne Tab-Bar (Wide) navigierbar", () => {
    const appsRoutes = getSidebarItems("apps").map((item) => item.route);
    expect(appsRoutes).toContain("/account");
    expect(getSidebarItems("apps")).not.toBe(APPS_ITEMS);
    expect(getSidebarItems("superagent")[0]?.route).toBe("/superagent");
  });

  it("leitet den ehrlichen Footer-Status je Zone und Server-Zustand ab", () => {
    expect(resolveSidebarFooter("apps", "online")).toEqual({ label: "SYSTEM ONLINE", tone: "positive" });
    expect(resolveSidebarFooter("superagent", "online")).toEqual({ label: "ORCHESTRATOR ERREICHBAR", tone: "positive" });
    expect(resolveSidebarFooter("apps", "offline")).toEqual({ label: "SYSTEM OFFLINE", tone: "negative" });
    expect(resolveSidebarFooter("superagent", "offline")).toEqual({ label: "ORCHESTRATOR OFFLINE", tone: "negative" });
    expect(resolveSidebarFooter("apps", "checking")).toEqual({ label: "SYSTEM PRÜFT…", tone: "muted" });
    expect(resolveSidebarFooter("superagent", "checking")).toEqual({ label: "ORCHESTRATOR PRÜFT…", tone: "muted" });
  });
});
