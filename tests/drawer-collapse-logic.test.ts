import { describe, expect, it } from "vitest";
import { isDrawerSectionCollapsed, toggleDrawerSection } from "@/lib/drawer-collapse-logic";

describe("mobile drawer collapse", () => {
  it("toggles a single group and keeps previous state immutable", () => {
    const initial = { revenue: true };
    const next = toggleDrawerSection(initial, "system");
    expect(next).toEqual({ revenue: true, system: true });
    expect(initial).toEqual({ revenue: true });
    expect(toggleDrawerSection(next, "system")).toEqual({ revenue: true, system: false });
  });

  it("expands collapsed groups during search without overwriting preferences", () => {
    const state = { system: true };
    expect(isDrawerSectionCollapsed(state, "system", "")).toBe(true);
    expect(isDrawerSectionCollapsed(state, "system", "apk")).toBe(false);
    expect(isDrawerSectionCollapsed(state, "system", "  ")).toBe(true);
    expect(state.system).toBe(true);
  });

  it("leaves unconfigured groups expanded", () => {
    expect(isDrawerSectionCollapsed({}, "growth", "")).toBe(false);
  });
});
