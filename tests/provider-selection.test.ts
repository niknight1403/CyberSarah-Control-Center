import { describe, expect, it } from "vitest";
import { buildWorkspaceHeaders } from "../lib/remote-workspace-client";
import { getDefaultFreeProvider, isFreeTierProvider, providerDefaults, type ProviderId } from "../lib/studio-settings-logic";

describe("AI provider selection", () => {
  it("contains the optional provider defaults", () => {
    const providers: ProviderId[] = ["managed", "openai", "gemini", "openrouter", "groq", "together", "anthropic", "ollama", "lmstudio", "custom", "huggingface"];
    expect(providers.every((provider) => providerDefaults[provider].model.length > 0)).toBe(true);
    expect(providerDefaults.gemini.model).toBe("gemini-3.6-flash");
    expect(providerDefaults.openrouter.model).toBe("openrouter/free");
    expect(providerDefaults.ollama.freeTierNote).toContain("lokal");
    expect(providerDefaults.lmstudio.freeTierNote).toContain("lokal");
    expect(providerDefaults.huggingface.freeTierNote).toContain("Free");
    expect(getDefaultFreeProvider()).toBe("gemini");
    expect(isFreeTierProvider("ollama")).toBe(true);
    expect(isFreeTierProvider("openai")).toBe(false);
  });

  it("sends provider identity and key only as request headers", () => {
    const headers = buildWorkspaceHeaders({ baseUrl: "https://workspace.example", provider: "gemini", providerApiKey: "secret-key" });
    expect(headers["X-AI-Provider"]).toBe("gemini");
    expect(headers["X-AI-Provider-Key"]).toBe("secret-key");
    expect(JSON.stringify(headers)).not.toContain("workspace.example");
  });
});
