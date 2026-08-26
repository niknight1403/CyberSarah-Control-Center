import { describe, expect, it } from "vitest";
import { validateLocalProviderEndpoint, validateServiceAccessToken, validateWorkspaceUrl } from "../lib/settings-validation";

describe("settings validation", () => {
  it("accepts a non-placeholder HTTPS workspace address", () => {
    expect(validateWorkspaceUrl("https://studio.example-network.de/api")).toMatchObject({ valid: true, tone: "success" });
  });

  it("rejects an insecure, malformed, or placeholder workspace address", () => {
    expect(validateWorkspaceUrl("http://studio.example-network.de")).toMatchObject({ valid: false, tone: "error" });
    expect(validateWorkspaceUrl("studio.example-network.de")).toMatchObject({ valid: false, tone: "error" });
    expect(validateWorkspaceUrl("https://studio.example.com")).toMatchObject({ valid: false, tone: "error" });
  });

  it("accepts local HTTP(S) provider endpoints and explains the Android localhost caveat", () => {
    expect(validateLocalProviderEndpoint("http://127.0.0.1:11434/v1", "Ollama")).toMatchObject({ valid: true, tone: "success" });
    expect(validateLocalProviderEndpoint("https://ollama.internal.example.com/v1", "Ollama")).toMatchObject({ valid: false, tone: "error" });
    expect(validateLocalProviderEndpoint("http://192.168.1.20:1234/v1", "LM Studio")).toMatchObject({ valid: true, tone: "success" });
    expect(validateLocalProviderEndpoint("http://user:password@192.168.1.20:1234/v1", "LM Studio")).toMatchObject({ valid: false, tone: "error" });
  });

  it("requires a clean long service token unless one is already securely stored", () => {
    expect(validateServiceAccessToken("short-token", false)).toMatchObject({ valid: false, tone: "error" });
    expect(validateServiceAccessToken("Bearer abcdefghijklmnopqrstuvwxyz", false)).toMatchObject({ valid: false, tone: "error" });
    expect(validateServiceAccessToken("abc defghijklmnopqrstuvwxyz", false)).toMatchObject({ valid: false, tone: "error" });
    expect(validateServiceAccessToken("abcdefghijklmnopqrstuvwxyz012345", false)).toMatchObject({ valid: true, tone: "success" });
    expect(validateServiceAccessToken("", true)).toMatchObject({ valid: true, tone: "stored" });
  });
});
