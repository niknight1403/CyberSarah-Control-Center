import { describe, expect, it } from "vitest";
import { isDrawerSectionCollapsed, toggleDrawerSection } from "@/lib/drawer-collapse-logic";

describe("mobile drawer collapse", () => {
  it("toggles a single group and keeps previous state immutable", () => {
    const initial = { revenue: true };
    const next = toggleDrawerSection(initial, "development");
    expect(next).toEqual({ revenue: true, development: true });
    expect(initial).toEqual({ revenue: true });
    expect(toggleDrawerSection(next, "development")).toEqual({ revenue: true, development: false });
  });

  it("expands collapsed groups during search without overwriting preferences", () => {
    const state = { development: true };
    expect(isDrawerSectionCollapsed(state, "development", "")).toBe(true);
    expect(isDrawerSectionCollapsed(state, "development", "apk")).toBe(false);
    expect(isDrawerSectionCollapsed(state, "development", "  ")).toBe(true);
    expect(state.development).toBe(true);
  });

  it("leaves unconfigured groups expanded", () => {
    expect(isDrawerSectionCollapsed({}, "studio", "")).toBe(false);
  });
});
