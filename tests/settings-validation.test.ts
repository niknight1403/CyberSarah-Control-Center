import { describe, expect, it } from "vitest";
import { validateServiceAccessToken, validateWorkspaceUrl } from "../lib/settings-validation";

describe("settings validation", () => {
  it("accepts a non-placeholder HTTPS workspace address", () => {
    expect(validateWorkspaceUrl("https://studio.example-network.de/api")).toMatchObject({ valid: true, tone: "success" });
  });

  it("rejects an insecure, malformed, or placeholder workspace address", () => {
    expect(validateWorkspaceUrl("http://studio.example-network.de")).toMatchObject({ valid: false, tone: "error" });
    expect(validateWorkspaceUrl("studio.example-network.de")).toMatchObject({ valid: false, tone: "error" });
    expect(validateWorkspaceUrl("https://studio.example.com")).toMatchObject({ valid: false, tone: "error" });
  });

  it("requires a clean long service token unless one is already securely stored", () => {
    expect(validateServiceAccessToken("short-token", false)).toMatchObject({ valid: false, tone: "error" });
    expect(validateServiceAccessToken("Bearer abcdefghijklmnopqrstuvwxyz", false)).toMatchObject({ valid: false, tone: "error" });
    expect(validateServiceAccessToken("abc defghijklmnopqrstuvwxyz", false)).toMatchObject({ valid: false, tone: "error" });
    expect(validateServiceAccessToken("abcdefghijklmnopqrstuvwxyz012345", false)).toMatchObject({ valid: true, tone: "success" });
    expect(validateServiceAccessToken("", true)).toMatchObject({ valid: true, tone: "stored" });
  });
});
