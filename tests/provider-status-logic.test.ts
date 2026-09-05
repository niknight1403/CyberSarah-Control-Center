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

  it("classifies custom endpoints by their actual endpoint location", () => {
    expect(getProviderChannel("custom", "http://127.0.0.1:9000/v1")).toBe(
      "local",
    );
    expect(getProviderChannel("custom", "http://192.168.1.40:9000/v1")).toBe(
      "local",
    );
    expect(getProviderChannel("custom", "https://api.example.com/v1")).toBe(
      "cloud",
    );
    expect(getProviderChannel("custom")).toBe("cloud");
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
    expect(getProviderStatusCopy("gemini", "error")).toMatchObject({
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
