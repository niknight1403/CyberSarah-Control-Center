import { describe, expect, it } from "vitest";

import {
  isDesktopViewport,
  isWideViewport,
  resolveActiveSidebarItem,
  SIDEBAR_ITEMS,
  VIEWPORT_BREAKPOINTS,
} from "../lib/viewport-logic";

describe("viewport logic", () => {
  it("marks viewports from the tablet breakpoint as wide", () => {
    expect(VIEWPORT_BREAKPOINTS.tablet).toBe(768);
    expect(isWideViewport(320)).toBe(false);
    expect(isWideViewport(767)).toBe(false);
    expect(isWideViewport(768)).toBe(true);
    expect(isWideViewport(1280)).toBe(true);
    expect(isDesktopViewport(1199)).toBe(false);
    expect(isDesktopViewport(1200)).toBe(true);
  });

  it("covers every tab route plus settings in the sidebar", () => {
    const routes = SIDEBAR_ITEMS.map((item) => item.route);
    expect(routes).toEqual(["/", "/chat", "/agent", "/preview", "/quality", "/account", "/settings"]);
    expect(SIDEBAR_ITEMS.every((item) => item.title.length > 0 && item.icon)).toBe(true);
  });

  it("resolves the active item for exact and nested paths", () => {
    expect(resolveActiveSidebarItem("/")?.route).toBe("/");
    expect(resolveActiveSidebarItem("/chat")?.route).toBe("/chat");
    expect(resolveActiveSidebarItem("/account")?.route).toBe("/account");
    expect(resolveActiveSidebarItem("/settings")?.route).toBe("/settings");
    expect(resolveActiveSidebarItem("/chat/session-42")?.route).toBe("/chat");
    expect(resolveActiveSidebarItem("/unbekannt")).toBeNull();
  });

  it("prefers the most specific prefix match", () => {
    const item = resolveActiveSidebarItem("/quality/report-7/details");
    expect(item?.route).toBe("/quality");
  });
});
