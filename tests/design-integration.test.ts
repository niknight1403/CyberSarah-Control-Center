import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tabsDir = path.join(root, "app", "(tabs)");

function source(file: string): string {
  return fs.readFileSync(path.join(tabsDir, file), "utf8");
}

describe("CyberSarah Future Glass design integration", () => {
  it("uses the canonical reference palette and status semantics", () => {
    const tokens = fs.readFileSync(path.join(root, "lib", "design", "future-glass.ts"), "utf8");
    // Sprint 355 — Aurora Flow ist die kanonische Referenzpalette.
    expect(tokens).toContain('cyan: "#00F2FE"');
    expect(tokens).toContain('purple: "#7C3AED"');
    expect(tokens).toContain('purple: "#7C3AED"');
    expect(tokens).toContain('magenta: "#EC4899"');
    expect(tokens).toContain('green: "#00E5B0"');
    expect(tokens).toContain('blue: "#38BDF8"');
    expect(tokens).toContain('idle: { accent: "purple"');
    expect(tokens).toContain('success: { accent: "green"');
    expect(tokens).toContain('error: { accent: "red"');
  });

  it("wraps every user-facing tab screen in the shared glass system", () => {
    const screens = [
      "account.tsx",
      "agent.tsx",
      "business.tsx",
      "chat.tsx",
      "cyber-dashboard.tsx",
      "cyber-terminal.tsx",
      "dashboard.tsx",
      "index.tsx",
      "preview.tsx",
      "quality.tsx",
      "superagent.tsx",
    ];
    for (const file of screens) {
      const code = source(file);
      expect(code, `${file} must use the shared Future Glass backdrop`).toContain("GlassBackdrop");
    }
  });

  it("keeps navigation and interaction primitives on the Future Glass path", () => {
    const layout = source("_layout.tsx");
    expect(layout).toContain("GlassTabIcon");
    expect(layout).toContain("tabBarStyle");
    expect(layout).toContain("glass.glassPalette.cyan");

    const dashboard = source("dashboard.tsx");
    expect(dashboard).toContain("MetricTile");
    expect(dashboard).toContain("ControlModuleCard");
    expect(dashboard).toContain("SuperagentHeroCard");
    expect(dashboard).toContain('router.push("/chat"');
    expect(dashboard).toContain('router.push("/business"');
  });
});
