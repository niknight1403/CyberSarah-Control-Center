import { afterEach, describe, expect, it, vi } from "vitest";
import { probeLocalProviders } from "../server/model-router";

describe("Ollama-Oracle-Route (geschuetzter Endpoint)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sendet den Bearer-Key an /models der konfigurierten Route", async () => {
    vi.stubEnv("AI_OLLAMA_BASE_URL", "https://ollama.example.test/v1/");
    vi.stubEnv("AI_OLLAMA_API_KEY", "secret-token");
    const calls: { url: string; auth?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        calls.push({ url, auth: init?.headers?.Authorization });
        return { ok: url.startsWith("https://ollama.example.test") } as Response;
      }),
    );
    const results = await probeLocalProviders();
    const ollama = calls.find((c) => c.url.startsWith("https://ollama.example.test"));
    expect(ollama?.url).toBe("https://ollama.example.test/v1/models");
    expect(ollama?.auth).toBe("Bearer secret-token");
    expect(results.find((r) => r.provider === "ollama")?.reachable).toBe(true);
  });

  it("ohne Key wird kein Authorization-Header gesendet (lokales Ollama)", async () => {
    vi.stubEnv("AI_OLLAMA_API_KEY", "");
    vi.stubEnv("OLLAMA_API_KEY", "");
    const seen: (Record<string, string> | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { headers?: Record<string, string> }) => {
        seen.push(init?.headers);
        return { ok: false } as Response;
      }),
    );
    await probeLocalProviders();
    expect(seen.every((h) => h === undefined)).toBe(true);
  });
});
