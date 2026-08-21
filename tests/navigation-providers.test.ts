import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "..");

describe("root route providers", () => {
  it("places StudioSettingsProvider above the root stack so standalone settings can consume it", () => {
    const rootLayout = fs.readFileSync(path.join(projectRoot, "app/_layout.tsx"), "utf8");
    const providerPosition = rootLayout.indexOf("<StudioSettingsProvider>");
    const stackPosition = rootLayout.indexOf("<Stack screenOptions");

    expect(providerPosition).toBeGreaterThan(-1);
    expect(stackPosition).toBeGreaterThan(providerPosition);
  });

  it("avoids a second settings provider scoped only to tab routes", () => {
    const tabLayout = fs.readFileSync(path.join(projectRoot, "app/(tabs)/_layout.tsx"), "utf8");

    expect(tabLayout).not.toContain("StudioSettingsProvider");
  });
});
