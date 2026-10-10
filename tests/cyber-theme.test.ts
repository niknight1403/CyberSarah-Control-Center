import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { select: (options: Record<string, string>) => options.default },
}));

import { cyber, cyberGradient, cyberTypography, statusColors } from "@/lib/cyber-theme";

describe("cyber-theme", () => {
  it("uses the canonical Dark-Cyber palette and preserves legacy aliases", () => {
    expect(cyber).toMatchObject({
      bg: "#0A0D12",
      surface: "#121823",
      surfaceElevated: "#1A2330",
      pink: "#FF6B7A",
      purple: "#8B7CFF",
      blue: "#52D8FF",
      cyan: "#52D8FF",
      green: "#45D996",
      amber: "#F6BA5E",
      text: "#F2F6FC",
      textMuted: "#99A7B8",
    });
    expect(cyber.blue).toBe(cyber.cyan);
  });

  it("builds the accent gradient and maps every status to its palette color", () => {
    expect(cyberGradient).toEqual([cyber.pink, cyber.purple, cyber.blue, cyber.cyan]);
    expect(statusColors).toEqual({
      idle: cyber.textDim,
      running: cyber.cyan,
      error: cyber.pink,
      success: cyber.green,
      warn: cyber.amber,
    });
  });

  it("exposes expected typography roles and a platform-safe monospace font", () => {
    expect(cyberTypography.display.fontSize).toBe(28);
    expect(cyberTypography.headline.fontSize).toBe(18);
    expect(cyberTypography.body.fontSize).toBe(14);
    expect(cyberTypography.caption.fontSize).toBe(11);
    expect(cyberTypography.mono.fontFamily).toBe("monospace");
  });
});
