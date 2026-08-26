import { describe, expect, it } from "vitest";
import { getProviderChannel, getProviderStatusCopy } from "../lib/provider-status-logic";

describe("provider status logic", () => {
  it("distinguishes local providers from cloud providers", () => {
    expect(getProviderChannel("ollama")).toBe("local");
    expect(getProviderChannel("lmstudio")).toBe("local");
    expect(getProviderChannel("gemini")).toBe("cloud");
    expect(getProviderChannel("openrouter")).toBe("cloud");
  });

  it("describes an active local provider", () => {
    expect(getProviderStatusCopy("ollama", "active", "ollama")).toMatchObject({ title: "Lokale KI aktiv", badge: "Lokal", tone: "ready" });
  });

  it("makes a cloud fallback explicit", () => {
    expect(getProviderStatusCopy("ollama", "fallback", "gemini")).toMatchObject({ title: "Cloud-Fallback aktiv", badge: "Fallback", tone: "warning" });
  });
});
