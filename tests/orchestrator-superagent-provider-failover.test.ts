/**
 * Sprint 150 — Root-Cause-Regressionstest.
 *
 * Vorher: server/orchestrator/superagent.ts rief die LLM-API direkt und
 * ausschliesslich mit OPENAI_API_KEY auf. Ein erschoepftes OpenAI-Konto
 * ("insufficient_quota"/"credit_balance_exhausted", HTTP 429) eskalierte
 * DAHER JEDE Superagent-Aufgabe nach 3 Iterationen, obwohl der bereits
 * vorhandene Zero-Cost-Multi-Provider-Router (invokeLLM) ueber
 * Groq/OpenRouter/Gemini-Free-Tier laengst funktionsfaehig war.
 *
 * Dieser Test verifiziert: Der Superagent nutzt jetzt denselben Router wie
 * der Entwicklungs-Chat — ein 429 auf einem Anbieter (hier: der zuerst
 * versuchte Kandidat) blockiert nicht mehr die gesamte Aufgabe, solange ein
 * weiterer konfigurierter Kandidat verfuegbar ist.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Der State-Store persistiert Tasks ueber die generische KV-Tabelle
// (modelRouterSettings) in Neon-Postgres. Fuer diesen reinen Provider-
// Failover-Test wird eine In-Memory-Fake-DB verwendet, damit der Test ohne
// Live-Datenbankverbindung deterministisch laeuft.
const kv = new Map<string, unknown>();
vi.mock("../server/db", () => ({
  getModelRouterSetting: vi.fn(async (key: string) => kv.get(key) ?? null),
  setModelRouterSetting: vi.fn(async (key: string, value: unknown) => {
    kv.set(key, value);
  }),
}));

import { resetManagedKeyPoolForTests } from "../server/_core/llm";
import { runOrchestratorTask } from "../server/orchestrator/superagent";

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

const OPENAI_URL = "api.openai.com";
const GROQ_URL = "api.groq.com";

describe("runOrchestratorTask — Zero-Cost-Multi-Provider-Failover (Sprint 150)", () => {
  beforeEach(() => {
    kv.clear();
    resetManagedKeyPoolForTests();
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.ORCHESTRATOR_MODEL;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.AI_GEMINI_API_KEY;
    process.env.AI_GROQ_API_KEY = "groq-test-key-1234"; // gitleaks:allow — Test-Fixture, kein echtes Secret
    process.env.OPENAI_API_KEY = "sk-openai-test-exhausted";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_GROQ_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  it("schliesst die Aufgabe erfolgreich ab, wenn OpenAI 429/insufficient_quota liefert aber Groq verfuegbar ist", async () => {
    const calledUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calledUrls.push(url);
        if (url.includes(OPENAI_URL)) {
          return fakeResponse(429, {
            error: {
              message: "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
              type: "insufficient_quota",
              code: "credit_balance_exhausted",
            },
          });
        }
        if (url.includes(GROQ_URL)) {
          return fakeResponse(200, {
            id: "test-1",
            created: Date.now(),
            model: "llama-3.3-70b-versatile",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: '{"status":"success","summary":"Erledigt via Groq-Fallback."}' },
                finish_reason: "stop",
              },
            ],
          });
        }
        return fakeResponse(500, { error: "unerwarteter Endpoint im Test" });
      }),
    );

    const task = await runOrchestratorTask({ objective: "Pruefe den Produktiv-Deploy" });

    expect(task.status).toBe("success");
    expect(calledUrls.some((u) => u.includes(GROQ_URL))).toBe(true);
  });

  /**
   * Sprint 151 — Root-Cause-Regressionstest.
   *
   * Vorher: Eine Assistant-Antwort mit reinen Tool-Aufrufen (kein Text,
   * content=null bzw. das Feld fehlt komplett) wurde nach der Tool-
   * Ausfuehrung unveraendert in den Multi-Turn-Verlauf zurueckgelegt. Sobald
   * invokeLLM() diese Historie in der NAECHSTEN Runde erneut normalisierte
   * (server/_core/llm.ts::normalizeMessage), scheiterte
   * ensureArray(null).map(normalizeContentPart) mit "Cannot read properties
   * of undefined (reading 'type')" — der Superagent eskalierte JEDE Aufgabe
   * mit Tool-Aufrufen nach 3 Wiederholungen, unabhaengig vom Anbieter.
   *
   * Dieser Test simuliert genau das: Runde 1 liefert eine Tool-Call-Antwort
   * ohne content-Feld, Runde 2 (nach Tool-Ausfuehrung) muss die Historie
   * inkl. dieser Nachricht erneut normalisieren und darf nicht abstuerzen.
   */
  it("eskaliert NICHT, wenn eine Tool-Call-Antwort ohne Text-Content in Runde 2 erneut normalisiert wird", async () => {
    let round = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes(GROQ_URL)) {
          round += 1;
          if (round === 1) {
            // Reine Tool-Call-Antwort — kein "content"-Feld (wie bei
            // manchen OpenAI-kompatiblen Providern ueblich).
            return fakeResponse(200, {
              id: "test-round-1",
              created: Date.now(),
              model: "llama-3.3-70b-versatile",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    tool_calls: [
                      { id: "call_1", type: "function", function: { name: "fs.listWorkspace", arguments: "{}" } },
                    ],
                  },
                  finish_reason: "tool_calls",
                },
              ],
            });
          }
          return fakeResponse(200, {
            id: "test-round-2",
            created: Date.now(),
            model: "llama-3.3-70b-versatile",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: '{"status":"success","summary":"Workspace geprueft."}' },
                finish_reason: "stop",
              },
            ],
          });
        }
        return fakeResponse(500, { error: "unerwarteter Endpoint im Test" });
      }),
    );

    const task = await runOrchestratorTask({ objective: "Liste den Workspace-Inhalt auf" });

    expect(task.status).toBe("success");
    expect(round).toBeGreaterThanOrEqual(2);
  });
});
