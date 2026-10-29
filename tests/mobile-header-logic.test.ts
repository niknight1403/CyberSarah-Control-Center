import { describe, expect, it } from "vitest";
import { MOBILE_HEADER_ROUTES, resolveMobileHeader } from "@/lib/mobile-header-logic";
import { DRAWER_ITEMS } from "@/lib/nav-drawer-logic";

describe("mobile header resolution", () => {
  it("has an explicit header for every drawer destination", () => {
    expect(DRAWER_ITEMS.every((item) => Boolean(MOBILE_HEADER_ROUTES[item.route]))).toBe(true);
  });

  it("shows correct headings for nested and deep-linked screens", () => {
    expect(resolveMobileHeader("/quality/build/42").title).toBe("Qualität");
    expect(resolveMobileHeader("/chat/session-99").title).toBe("Chat");
    expect(resolveMobileHeader("/revenue-os/campaigns").title).toBe("Revenue OS");
    expect(resolveMobileHeader("/")).toEqual(MOBILE_HEADER_ROUTES["/"]);
  });

  it("does not falsely select routes based on partial segment matches", () => {
    expect(resolveMobileHeader("/agentic")).toEqual({ title: "CyberSarah", subtitle: "AI Control Center" });
    expect(resolveMobileHeader("/quality-check")).toEqual({ title: "CyberSarah", subtitle: "AI Control Center" });
    expect(resolveMobileHeader("/unknown")).toEqual({ title: "CyberSarah", subtitle: "AI Control Center" });
  });

  it("accepts slash suffixed route names without changing their meaning", () => {
    expect(resolveMobileHeader("/chat/")).toEqual(MOBILE_HEADER_ROUTES["/chat"]);
    expect(resolveMobileHeader("")).toEqual(MOBILE_HEADER_ROUTES["/"]);
  });
});
