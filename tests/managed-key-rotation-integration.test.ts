/**
 * Sprint 85 — Live-Integration der autonomen API-Key-Rotation:
 * invokeLLM verwaltet einen Pool der Managed-Endpoints (Forge > Gemini >
 * OpenAI) und rotiert bei 429-/Quota-/Auth-Fehlern automatisch auf den
 * naechsten gesunden Key. Exhausted Keys (401/402/403) werden in
 * Folgerequests ausgelassen, bis der Pool-Status sich erholen kann.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { invokeLLM, resetManagedKeyPoolForTests } from "../server/_core/llm";

type Call = { url: string; body: Record<string, unknown> };

const fakeResponse = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "Test",
    headers: { get: () => null },
    body: undefined,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }) as unknown as Response;

const GEMINI_URL = "generativelanguage.googleapis.com";
const OPENAI_URL = "api.openai.com";

describe("invokeLLM mit autonomem Key-Pool (Sprint 85)", () => {
  beforeEach(() => {
    resetManagedKeyPoolForTests();
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_URL;
    process.env.AI_GEMINI_API_KEY = "gem-test-key-1234";
    process.env.OPENAI_API_KEY = "sk-openai-test-5678";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  it("rotiert bei 429 automatisch auf den naechsten Key mit passendem Modell", async () => {
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
        if (url.includes(GEMINI_URL)) {
          return fakeResponse(429, { error: { message: "Quota exceeded" } });
        }
        return fakeResponse(200, { model: "gpt-4o-mini", content: "ok" });
      }),
    );

    const result = await invokeLLM({ messages: [{ role: "user", content: "hi" }] });

    expect(result).toMatchObject({ model: "gpt-4o-mini" });
    expect(calls.length).toBe(2);
    expect(calls[0].url).toContain(GEMINI_URL);
    expect(calls[0].body.model).toBe("gemini-flash-latest");
    expect(calls[1].url).toContain(OPENAI_URL);
    expect(calls[1].body.model).toBe("gpt-4o-mini");
  });

  it("markiert Keys mit 402/403/401 als erschöpft und laesst sie in Folgerequests aus", async () => {
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
        if (url.includes(GEMINI_URL)) {
          return fakeResponse(402, { error: { message: "You have no credits remaining" } });
        }
        return fakeResponse(200, { model: "gpt-4o-mini", content: "ok" });
      }),
    );

    // Request 1: Gemini credits-leer (402) → Failover auf OpenAI erfolgreich.
    const result = await invokeLLM({ messages: [{ role: "user", content: "hi" }] });
    expect(result).toMatchObject({ model: "gpt-4o-mini" });
    expect(calls.length).toBe(2);
    expect(calls[0].url).toContain(GEMINI_URL);
    expect(calls[1].url).toContain(OPENAI_URL);

    // Request 2: Der erschöpfte Gemini-Key wird übersprungen (nur OpenAI).
    calls.length = 0;
    await invokeLLM({ messages: [{ role: "user", content: "hi again" }] });
    expect(calls.length).toBe(1);
    expect(calls[0].url).toContain(OPENAI_URL);
  });

  it("wirft den letzten Fehler, wenn alle Keys der Kette scheitern", async () => {
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push({ url, body: {} });
        return fakeResponse(429, { error: { message: "rate limited" } });
      }),
    );

    await expect(invokeLLM({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow(
      /LLM invoke failed: 429/,
    );
    expect(calls.length).toBe(2);
  });
});
