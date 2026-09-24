/**
 * Sprint 85 — Live-Integration der autonomen API-Key-Rotation:
 * invokeLLM verwaltet einen Pool der Managed-Endpoints (Sprint 108:
 * Gratis-Kette Groq > OpenRouter > Gemini; Paid nur per Admin-Override)
 * und rotiert bei 429-/Quota-/Auth-Fehlern automatisch auf den
 * naechsten gesunden Key. Exhausted Keys (401/402/403) werden in
 * Folgerequests ausgelassen, bis der Pool-Status sich erholen kann.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { invokeLLM, resetManagedKeyPoolForTests } from "../server/_core/llm";
// Root-Cause-Fix (Serie G): Modul-Spiegel des Rotations-Agenten und Quarantaene-
// Registry muessen JEDEM Test-Start sauber sein — bei isolate:false leaken
// sonst Zustaende aus Parallel-Dateien in diese Suite (Sprint-85-Flaky).
import { resetRouteRotationStateForTests } from "../server/_core/route-rotation-state";
import { resetProviderQuarantineForTests } from "../lib/live-fix-logic";

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

describe(
  "invokeLLM mit autonomem Key-Pool (Sprint 85)",
  // Echtes Exponential-Backoff in invokeLLM + parallele Suite-Last
  // sprengten den 5s-Default-Timeout (Flaky unter Last, solo gruen).
  { timeout: 30_000 },
  () => {
  // Test-Isolation: invokeLLM sendet seit Sprint 196/210 bei Provider-
  // Failover Telegram-Warnungen — sobald Token + Chat-ID in der Env
  // stehen, wuerden diese zusaetzlichen Fetches die Call-Zaehler
  // verfaelschen (Host-Env und CI setzen beide Secrets). Fuer die
  // Rotations-Assertions werden sie daher deterministisch entfernt.
  const savedTelegramEnv = {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  };

  beforeEach(() => {
    resetManagedKeyPoolForTests();
    resetRouteRotationStateForTests();
    resetProviderQuarantineForTests();
    // Env-Reste aus Parallel-Dateien (z. B. AI_GROQ_API_KEY aus der
    // Rotations-Agent-Suite) wuerden die Kette verlaengern — hier ehrlich
    // loeschen statt nur im afterEach (das bereinigt nur EIGENE Sets).
    delete process.env.AI_GROQ_API_KEY;
    delete process.env.AI_OPENROUTER_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_CUSTOM_API_KEY;
    delete process.env.AI_CUSTOM_BASE_URL;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.BUILT_IN_FORGE_API_URL;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    process.env.AI_GEMINI_API_KEY = "gem-test-key-1234";
    process.env.OPENAI_API_KEY = "sk-openai-test-5678";
    // Sprint 108: Die Rotations-Mechanik wird hier mit aktivem Admin-Override
    // (AI_ALLOW_PAID_LLM_FALLBACK) getestet — der Standard-Zustand (Gratis-
    // Kette ohne Paid-Fallback) deckt der eigene Test unten ab.
    process.env.AI_ALLOW_PAID_LLM_FALLBACK = "true";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_ALLOW_PAID_LLM_FALLBACK;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.AI_GROQ_API_KEY;
    delete process.env.AI_OPENROUTER_API_KEY;
    // Telegram-Env wiederherstellen, damit andere Suites/Host-Prozesse
    // unbeeinflusst bleiben.
    if (savedTelegramEnv.botToken !== undefined) {
      process.env.TELEGRAM_BOT_TOKEN = savedTelegramEnv.botToken;
    }
    if (savedTelegramEnv.chatId !== undefined) {
      process.env.TELEGRAM_CHAT_ID = savedTelegramEnv.chatId;
    }
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

  it("Sprint 108: rotiert standardmaessig NUR durch die Gratis-Kette (Groq > OpenRouter > Gemini)", async () => {
    const calls: Call[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
        calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
        if (url.includes("groq.com")) {
          return fakeResponse(429, { error: { message: "Rate limit reached" } });
        }
        return fakeResponse(200, { model: "free-model", content: "ok" });
      }),
    );

    delete process.env.AI_ALLOW_PAID_LLM_FALLBACK;
    process.env.GROQ_API_KEY = "gsk-free-key";
    process.env.OPENROUTER_API_KEY = "sk-or-free-key";

    const result = await invokeLLM({ messages: [{ role: "user", content: "hi" }] });

    expect(result).toMatchObject({ model: "free-model" });
    // Kette: Groq (429) -> OpenRouter (Erfolg). Kein kostenpflichtiger Endpoint.
    expect(calls.length).toBe(2);
    expect(calls[0].url).toContain("api.groq.com");
    expect(calls[0].body.model).toBe("openai/gpt-oss-20b");
    expect(calls[1].url).toContain("openrouter.ai");
    expect(calls[1].body.model).toBe("meta-llama/llama-3.3-70b-instruct:free");
    expect(calls.every((call) => !call.url.includes("api.openai.com"))).toBe(true);
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
