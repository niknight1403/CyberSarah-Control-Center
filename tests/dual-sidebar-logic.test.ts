import { describe, expect, it } from "vitest";
import { PRIMARY_NAV_ITEMS, getPrimaryNavigation, matchesRoute, resolveSidebarFooter } from "../lib/dual-sidebar-logic";

describe("unified desktop primary navigation", () => {
  it("exposes exactly the same five product areas as the mobile tab bar", () => {
    expect(getPrimaryNavigation().map((item) => item.route)).toEqual([
      "/dashboard", "/media-studio", "/revenue-os", "/agent", "/account",
    ]);
    expect(new Set(PRIMARY_NAV_ITEMS.map((item) => item.route)).size).toBe(5);
    expect(getPrimaryNavigation()).not.toBe(PRIMARY_NAV_ITEMS);
  });

  it("matches routes exactly and as nested paths", () => {
    expect(matchesRoute("/chat", "/chat")).toBe(true);
    expect(matchesRoute("/chat/42", "/chat")).toBe(true);
    expect(matchesRoute("/chatzeugs", "/chat")).toBe(false);
    expect(matchesRoute("/", "/")).toBe(true);
    expect(matchesRoute("/(tabs)/index", "/")).toBe(true);
    expect(matchesRoute("/dashboard", "/")).toBe(false);
    expect(matchesRoute("/dashboard/neu", "/dashboard")).toBe(true);
  });

  it("reports only observed server reachability", () => {
    expect(resolveSidebarFooter("online")).toEqual({ label: "SERVER ERREICHBAR", tone: "positive" });
    expect(resolveSidebarFooter("offline")).toEqual({ label: "SERVER OFFLINE", tone: "negative" });
    expect(resolveSidebarFooter("checking")).toEqual({ label: "SERVER PRÜFT…", tone: "muted" });
  });
});
