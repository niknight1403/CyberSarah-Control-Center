import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Android GPU-safe graphics wiring", () => {
  it("keeps the theme palette reference stable for unchanged colors", () => {
    const colors = read("hooks/use-colors.ts");
    expect(colors).toContain("useMemo");
    expect(colors).toContain("scheme === colorScheme ? palette");
    expect(colors).not.toContain("return resolveDesignRuntimePalette(designTheme, scheme);");
  });
  it("disables backdrop animation and clouds on Android", () => {
    const backdrop = read("components/glass/glass-backdrop.tsx");
    expect(backdrop).toContain("const activeAtmosphere = atmosphere && motionEnabled");
    expect(backdrop).toContain("{motionEnabled ? (<>");
    expect(backdrop).toContain("{activeAtmosphere ? (");
    expect(backdrop).toContain("[activeAtmosphere, auroraDrift, accent, glass.glassPalette]");
  });
  it("gates chat particles and AI-core animation loops", () => {
    const chat = read("components/chat/chat-background.tsx");
    const core = read("components/glass/ai-core.tsx");
    const chips = read("components/glass/glass-primitives.tsx");
    expect(chat).toContain("{motionEnabled ? <ParticleField");
    expect(core).toContain("if (!motionEnabled || visual.rotationMs <= 0) return;");
    expect(core).toContain("if (!motionEnabled || visual.pulseMs <= 0) return;");
    expect(chips).toContain("const animateLive = live && decorativeMotionEnabled()");
  });
  it("reduces CSS glass blur when safe mode is active", () => {
    expect(read("lib/theme-provider.tsx")).toContain('setAttribute("data-cs-graphics-safe"');
    expect(read("global.css")).toContain('html[data-cs-graphics-safe="true"] .effect-glass');
  });
});
