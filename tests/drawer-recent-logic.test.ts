import { describe, expect, it } from "vitest";
import {
  MAX_RECENT_DRAWER_ROUTES, parseRecentRoutes, recordRecentRoute, sanitizeRecentRoutes,
} from "@/lib/drawer-recent-logic";

describe("recent mobile navigation", () => {
  it("accepts only real screens and rejects malformed or stale stored data", () => {
    expect(parseRecentRoutes(null)).toEqual([]);
    expect(parseRecentRoutes("{not-json")).toEqual([]);
    expect(parseRecentRoutes('{"route":"/dashboard"}')).toEqual([]);
    expect(parseRecentRoutes('["/preview","/preview","https://outside.example","/","/old"]')).toEqual(["/preview", "/"]);
  });

  it("keeps most recent first and limits its history", () => {
    let routes = sanitizeRecentRoutes([]);
    for (const route of ["/dashboard", "/chat", "/agent", "/quality", "/preview", "/account"]) {
      routes = recordRecentRoute(routes, route);
    }
    expect(routes).toHaveLength(MAX_RECENT_DRAWER_ROUTES);
    expect(routes).toEqual(["/account", "/preview", "/quality", "/agent", "/chat"]);
    expect(recordRecentRoute(routes, "/agent")[0]).toBe("/agent");
  });

  it("never inserts arbitrary deep links or untrusted values", () => {
    const initial = sanitizeRecentRoutes(["/dashboard", "javascript:alert(1)", null, "/dashboard"]);
    expect(initial).toEqual(["/dashboard"]);
    expect(recordRecentRoute(initial, "/not-existing")).toEqual(initial);
    expect(recordRecentRoute(initial, "https://malicious.example")).toEqual(initial);
  });
});
