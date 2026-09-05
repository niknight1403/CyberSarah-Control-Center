import { describe, expect, it } from "vitest";
import {
  getProviderChannel,
  getProviderStatusCopy,
} from "../lib/provider-status-logic";

describe("provider status logic", () => {
  it("distinguishes local providers from cloud providers", () => {
    expect(getProviderChannel("ollama")).toBe("local");
    expect(getProviderChannel("lmstudio")).toBe("local");
    expect(getProviderChannel("gemini")).toBe("cloud");
    expect(getProviderChannel("openrouter")).toBe("cloud");
  });

  it("treats custom endpoints as cloud unless their channel is explicit", () => {
    expect(getProviderChannel("custom")).toBe("cloud");
    expect(getProviderChannel("custom", "local")).toBe("local");
  });

  it("describes idle, requesting, active and error states", () => {
    expect(getProviderStatusCopy("gemini", "idle")).toMatchObject({
      title: "Cloud-Provider ausgewählt",
      badge: "Cloud",
    });
    expect(getProviderStatusCopy("ollama", "requesting")).toMatchObject({
      title: "KI-Anfrage läuft",
      badge: "Prüfung",
    });
    expect(getProviderStatusCopy("ollama", "active", "ollama")).toMatchObject({
      title: "Lokale KI aktiv",
      badge: "Lokal",
      tone: "ready",
    });
    expect(getProviderStatusCopy("gemini", "active", "gemini")).toMatchObject({
      title: "Cloud-Provider aktiv",
      badge: "Cloud",
      tone: "accent",
    });
    expect(getProviderStatusCopy("ollama", "error")).toMatchObject({
      title: "Provider nicht erreichbar",
      badge: "Fehler",
      tone: "warning",
    });
  });

  it("makes a cloud fallback explicit", () => {
    expect(getProviderStatusCopy("ollama", "fallback", "gemini")).toMatchObject(
      { title: "Cloud-Fallback aktiv", badge: "Fallback", tone: "warning" },
    );
  });
});
