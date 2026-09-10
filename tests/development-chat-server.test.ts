import http from "node:http";
import type { AddressInfo } from "node:net";
import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "../server/_core/llm";
import {
  handleDevelopmentChat,
  sanitizeChatError,
  testDevelopmentChatConnection,
} from "../server/development-chat";

const ENV_KEYS = [
  "AI_CUSTOM_BASE_URL",
  "AI_CUSTOM_API_KEY",
  "AI_CUSTOM_MODEL",
  "AI_FALLBACK_PROVIDERS",
  "AI_FALLBACK_PROVIDER",
  "AI_LMSTUDIO_BASE_URL",
  "AI_LMSTUDIO_MODEL",
  "AI_OPENAI_API_KEY",
  "OPENAI_API_KEY",
];

let originalEnv: Record<string, string | undefined> = {};

type MockServer = {
  port: number;
  requests: Array<{ body: Record<string, unknown> | null }>;
  close: () => Promise<void>;
};

function startMockServer(
  handler: (
    body: Record<string, unknown> | null,
    res: http.ServerResponse,
  ) => void,
): Promise<MockServer> {
  return new Promise((resolve) => {
    const requests: MockServer["requests"] = [];
    const server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        let body: Record<string, unknown> | null = null;
        try {
          body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
        } catch {
          body = null;
        }
        requests.push({ body });
        handler(body, res);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        requests,
        close: () =>
          new Promise((done) => server.close(() => done(undefined))),
      });
    });
  });
}

function endpoint(server: MockServer, path = "/v1/chat/completions") {
  return `http://127.0.0.1:${server.port}${path}`;
}

function replyWithContent(
  res: http.ServerResponse,
  content: string,
  model = "test-model",
) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      model,
    }),
  );
}

beforeEach(() => {
  originalEnv = {};
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(async () => {
  vi.mocked(invokeLLM).mockReset();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("development chat server chain", () => {
  it("liefert die Antwort des primären Providers ohne Fallback", async () => {
    const server = await startMockServer((body, res) => {
      const messages = (body?.messages ?? []) as Array<{ role: string; content: string }>;
      expect(messages[0]?.role).toBe("system");
      expect(messages.at(-1)?.content).toBe("Status?");
      replyWithContent(res, "Alles grün.");
    });
    process.env.AI_CUSTOM_BASE_URL = endpoint(server);
    process.env.AI_CUSTOM_API_KEY = "test-key";
    process.env.AI_CUSTOM_MODEL = "test-model";

    const result = await handleDevelopmentChat({
      provider: "custom",
      messages: [{ role: "user", content: "Status?" }],
    });

    expect(result.content).toBe("Alles grün.");
    expect(result.model).toBe("test-model");
    expect(result.providerUsed).toBe("custom");
    expect(result.fallbackUsed).toBe(false);
    expect(Number.isNaN(Date.parse(result.receivedAt))).toBe(false);
    await server.close();
  });

  it("weicht bei transienten Fehlern auf den konfigurierten Fallback aus", async () => {
    const failing = await startMockServer((_body, res) => {
      res.writeHead(503);
      res.end("Service Unavailable");
    });
    const fallback = await startMockServer((_body, res) =>
      replyWithContent(res, "Fallback-Antwort.", "fallback-model"),
    );
    process.env.AI_CUSTOM_BASE_URL = endpoint(failing);
    process.env.AI_CUSTOM_API_KEY = "test-key";
    process.env.AI_LMSTUDIO_BASE_URL = endpoint(fallback);
    process.env.AI_LMSTUDIO_MODEL = "fallback-model";
    process.env.AI_FALLBACK_PROVIDERS = "lmstudio";

    const result = await handleDevelopmentChat({
      provider: "custom",
      messages: [{ role: "user", content: "Status?" }],
    });

    expect(result.content).toBe("Fallback-Antwort.");
    expect(result.providerUsed).toBe("lmstudio");
    expect(result.fallbackUsed).toBe(true);
    await failing.close();
    await fallback.close();
  });

  it("übergibt permanente Fehler ohne Fallback-Versuch", async () => {
    const primary = await startMockServer((_body, res) => {
      res.writeHead(401);
      res.end("Unauthorized");
    });
    const fallback = await startMockServer((_body, res) =>
      replyWithContent(res, "darf nicht erreicht werden"),
    );
    process.env.AI_CUSTOM_BASE_URL = endpoint(primary);
    process.env.AI_CUSTOM_API_KEY = "test-key";
    process.env.AI_LMSTUDIO_BASE_URL = endpoint(fallback);
    process.env.AI_FALLBACK_PROVIDERS = "lmstudio";

    await expect(
      handleDevelopmentChat({
        provider: "custom",
        messages: [{ role: "user", content: "Status?" }],
      }),
    ).rejects.toMatchObject({ code: "BAD_GATEWAY" });
    expect(fallback.requests).toHaveLength(0);
    await primary.close();
    await fallback.close();
  });

  it("lehnt unkonfigurierte Cloud-Provider mit deutscher Meldung ab", async () => {
    const error = await handleDevelopmentChat({
      provider: "openai",
      messages: [{ role: "user", content: "Status?" }],
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("PRECONDITION_FAILED");
    expect((error as TRPCError).message).toContain("serverseitig nicht konfiguriert");
  });

  it("extrahiert mehrteilige Textantworten deterministisch", async () => {
    const server = await startMockServer((_body, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: [
                  { type: "text", text: "Teil 1" },
                  { type: "text", text: "Teil 2" },
                ],
              },
              finish_reason: "stop",
            },
          ],
          model: "parts-model",
        }),
      );
    });
    process.env.AI_CUSTOM_BASE_URL = endpoint(server);
    process.env.AI_CUSTOM_API_KEY = "test-key";

    const result = await handleDevelopmentChat({
      provider: "custom",
      messages: [{ role: "user", content: "Status?" }],
    });

    expect(result.content).toBe("Teil 1\nTeil 2");
    await server.close();
  });

  it("übersetzt den fehlenden On-Server-LLM in eine handlungsfähige Meldung", async () => {
    vi.mocked(invokeLLM).mockRejectedValue(
      new Error("OPENAI_API_KEY is not configured"),
    );

    const error = await handleDevelopmentChat({
      provider: "managed",
      messages: [{ role: "user", content: "Status?" }],
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe("PRECONDITION_FAILED");
    expect((error as TRPCError).message).toContain(
      "OPENAI_API_KEY in der Serverumgebung",
    );
  });

  it("beantwortet den Managed-Provider über invokeLLM", async () => {
    vi.mocked(invokeLLM).mockResolvedValue({
      id: "chatcmpl-test",
      created: 1_788_000_000,
      model: "managed-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Alles verwaltet." },
          finish_reason: "stop",
        },
      ],
    } as never);

    const result = await handleDevelopmentChat({
      provider: "managed",
      messages: [{ role: "user", content: "Status?" }],
    });

    expect(result.content).toBe("Alles verwaltet.");
    expect(result.model).toBe("managed-model");
    expect(result.providerUsed).toBe("managed");
  });

  it("prüft die Verbindung Ende-zu-Ende mit Latenzmessung", async () => {
    const server = await startMockServer((_body, res) =>
      replyWithContent(res, "OK", "conn-model"),
    );
    process.env.AI_CUSTOM_BASE_URL = endpoint(server);
    process.env.AI_CUSTOM_API_KEY = "test-key";
    process.env.AI_CUSTOM_MODEL = "conn-model";

    const probe = await testDevelopmentChatConnection("custom");

    expect(probe.ok).toBe(true);
    expect(probe.provider).toBe("custom");
    expect(probe.model).toBe("conn-model");
    expect(probe.latencyMs).toBeGreaterThanOrEqual(0);
    await server.close();
  });

  it("redigiert Verbindungsfehler ohne Endpoints oder Schlüsselfragmente", async () => {
    const server = await startMockServer((_body, res) => {
      res.writeHead(500);
      res.end("upstream http://internal.example/xyz?token=abc123 gescheitert");
    });
    process.env.AI_CUSTOM_BASE_URL = endpoint(server);
    process.env.AI_CUSTOM_API_KEY = "sk-testkey123456";
    process.env.AI_FALLBACK_PROVIDERS = "";

    const probe = await testDevelopmentChatConnection("custom");

    expect(probe.ok).toBe(false);
    expect(probe.error).toBeDefined();
    expect(probe.error).not.toMatch(/https?:\/\//);
    expect(probe.error).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
    expect(probe.latencyMs).toBeGreaterThanOrEqual(0);
    await server.close();
  });
});

describe("Sprint 53 — sanitizeChatError", () => {
  it("redigiert Keys und URLs in Chat-Fehlermeldungen", () => {
    const raw = 'LLM invoke failed: 401 Unauthorized – Incorrect API key: sk-proj-ABCDEFG12345. See https://api.openai.com/account';
    expect(sanitizeChatError(raw, "fallback")).not.toContain("sk-proj-ABCDEFG12345");
    expect(sanitizeChatError(raw, "fallback")).not.toContain("https://api.openai.com");
  });

  it("behält harmlose Meldungen und greift auf den Fallback bei leerem Ergebnis zu", () => {
    expect(sanitizeChatError("Der Provider antwortete nicht.", "fallback")).toBe("Der Provider antwortete nicht.");
  });
});
