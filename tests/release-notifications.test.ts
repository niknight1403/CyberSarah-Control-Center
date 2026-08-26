import { describe, expect, it } from "vitest";
import { createReleaseNotification, isTerminalReleaseStatus } from "../lib/release-notification-logic";

describe("release notification logic", () => {
  it("creates bounded German status copy without secrets", () => {
    const notification = createReleaseNotification("passed", "Commit 520b089 veröffentlicht.");
    expect(notification.title).toBe("CyberSarah: Release bereit");
    expect(notification.body).toContain("Build und Prüfungen");
    expect(notification.body).toContain("520b089");
    expect(notification.data).toEqual({ kind: "release", status: "passed" });
  });

  it("classifies only final release states as terminal", () => {
    expect(isTerminalReleaseStatus("started")).toBe(false);
    expect(isTerminalReleaseStatus("passed")).toBe(true);
    expect(isTerminalReleaseStatus("failed")).toBe(true);
    expect(isTerminalReleaseStatus("cancelled")).toBe(true);
  });
});
