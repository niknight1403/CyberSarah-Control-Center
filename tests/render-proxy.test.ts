import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  callWorkspaceService,
  registerRenderProxy,
  setRenderProxyRetryDelayForTests,
} from "../server/_core/renderProxy";

/**
 * Render-Proxy (`/api/render/*`) — die einzige Bruecke zwischen der App und dem
 * Workspace-Service auf Render. Fehler hier treffen jeden Agenten-Lauf, daher
 * werden Header-Weiterleitung, Cold-Start-Retry und Statusabbildung geprueft.
 *
 * Kein supertest/Express-Start: die Route wird direkt aus einer minimalen
 * Fake-App geholt, damit die Suite eine reine Logik-Suite bleibt.
 */

type Handler = (req: FakeRequest, res: FakeResponse) => Promise<void> | void;

type FakeRequest = {
  url: string;
  method: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
};

type FakeResponse = {
  statusCode?: number;
  headers: Record<string, string>;
  jsonBody?: unknown;
  sentBody?: unknown;
  status: (code: number) => FakeResponse;
  json: (payload: unknown) => FakeResponse;
  set: (name: string, value: string) => FakeResponse;
  send: (payload: unknown) => FakeResponse;
};

function proxyHandler(): Handler {
  const routes: Record<string, Handler> = {};
  registerRenderProxy({ all: (path: string, handler: Handler) => { routes[path] = handler; } } as never);
  const handler = routes["/api/render/*splat"];
  expect(handler).toBeTypeOf("function");
  return handler;
}

function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    headers: {},
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.jsonBody = payload;
      return res;
    },
    set(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    send(payload: unknown) {
      res.sentBody = payload;
      return res;
    },
  };
  return res;
}

type FetchCall = { url: string; init: { method?: string; headers?: Record<string, string>; body?: unknown } };

function stubFetch(responses: Array<() => Response | Promise<Response>>): FetchCall[] {
  const calls: FetchCall[] = [];
  let index = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: FetchCall["init"] = {}) => {
      calls.push({ url, init });
      const next = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return next();
    }),
  );
  return calls;
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function coldStartResponse(): Response {
  return new Response("<html>Service Unavailable</html>", {
    status: 502,
    headers: { "content-type": "text/html" },
  });
}

beforeEach(() => {
  vi.stubEnv("WORKSPACE_SERVICE_URL", "https://workspace.example.test");
  vi.stubEnv("WORKSPACE_SERVICE_TOKEN", "");
  vi.stubEnv("SERVICE_ACCESS_TOKEN", "");
  setRenderProxyRetryDelayForTests(0);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  setRenderProxyRetryDelayForTests(null);
});

describe("callWorkspaceService", () => {
  it("entfernt das Proxy-Praefix und gibt JSON weiter", async () => {
    const calls = stubFetch([() => jsonResponse(200, { ok: true, value: 42 })]);
    const result = await callWorkspaceService("/api/render/api/v1/agent/proposals", {
      method: "POST",
      body: JSON.stringify({ prompt: "hallo" }),
    });

    expect(result).toEqual({ ok: true, status: 200, json: { ok: true, value: 42 } });
    expect(calls[0].url).toBe("https://workspace.example.test/api/v1/agent/proposals");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(JSON.stringify({ prompt: "hallo" }));
  });

  it("setzt den Server-Token statt eines Client-Authorization-Headers", async () => {
    vi.stubEnv("WORKSPACE_SERVICE_TOKEN", "  service-token  ");
    const calls = stubFetch([() => jsonResponse(200, { ok: true })]);
    await callWorkspaceService("/api/render/api/v1/status", {
      method: "GET",
      headers: { authorization: "Bearer client-token" },
    });

    expect(calls[0].init.headers?.authorization).toBe("Bearer service-token");
  });

  it("reicht ohne Server-Token den Client-Header unveraendert durch", async () => {
    const calls = stubFetch([() => jsonResponse(200, { ok: true })]);
    await callWorkspaceService("/api/render/api/v1/status", {
      method: "GET",
      headers: { authorization: "Bearer client-token" },
    });

    expect(calls[0].init.headers?.authorization).toBe("Bearer client-token");
  });

  it("verpackt Nicht-JSON-Antworten als raw", async () => {
    stubFetch([
      () => new Response("plain text", { status: 200, headers: { "content-type": "text/plain" } }),
    ]);
    const result = await callWorkspaceService("/api/render/health", { method: "GET" });

    expect(result).toEqual({ ok: true, status: 200, json: { raw: "plain text" } });
  });

  it("liefert die Upstream-Fehlermeldung bei !ok", async () => {
    stubFetch([() => jsonResponse(400, { error: "Feld fehlt" })]);
    const result = await callWorkspaceService("/api/render/api/v1/agent/run", { method: "POST" });

    expect(result).toEqual({ ok: false, status: 400, error: "Feld fehlt" });
  });

  it("faellt bei !ok ohne error-Feld auf eine Statusmeldung zurueck", async () => {
    stubFetch([() => jsonResponse(500, { something: "else" })]);
    const result = await callWorkspaceService("/api/render/api/v1/agent/run", { method: "POST" });

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "Workspace-Service antwortet mit 500.",
    });
  });

  it("wiederholt einen Cold-Start-502 und liefert danach das Ergebnis", async () => {
    const calls = stubFetch([coldStartResponse, () => jsonResponse(200, { awake: true })]);
    const result = await callWorkspaceService("/api/render/api/v1/agent/proposals", { method: "GET" });

    expect(calls).toHaveLength(2);
    expect(result).toEqual({ ok: true, status: 200, json: { awake: true } });
  });

  it("meldet nach zwei Cold-Start-502 einen 503 mit Aufwach-Hinweis", async () => {
    const calls = stubFetch([coldStartResponse, coldStartResponse]);
    const result = await callWorkspaceService("/api/render/api/v1/agent/proposals", { method: "GET" });

    expect(calls).toHaveLength(2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(503);
      expect(result.error).toContain("Ruhemodus");
    }
  });

  it("behandelt einen 502 mit JSON-Content als echten Upstream-Fehler (kein Retry)", async () => {
    const calls = stubFetch([() => jsonResponse(502, { error: "interner Fehler" })]);
    const result = await callWorkspaceService("/api/render/api/v1/agent/run", { method: "POST" });

    expect(calls).toHaveLength(1);
    expect(result).toEqual({ ok: false, status: 502, error: "interner Fehler" });
  });

  it("uebersetzt Netzwerkfehler in einen 502 ohne Retry", async () => {
    const calls = stubFetch([
      () => {
        throw new Error("ECONNREFUSED");
      },
    ]);
    const result = await callWorkspaceService("/api/render/api/v1/status", { method: "GET" });

    expect(calls).toHaveLength(1);
    expect(result).toEqual({
      ok: false,
      status: 502,
      error: "Der Workspace-Service (Render) ist nicht erreichbar.",
    });
  });

  it("unterscheidet einen Timeout von einem Verbindungsfehler", async () => {
    stubFetch([
      () => {
        const error = new Error("timed out");
        error.name = "TimeoutError";
        throw error;
      },
    ]);
    const result = await callWorkspaceService("/api/render/api/v1/status", { method: "GET" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Cold-Start");
  });
});

describe("registerRenderProxy", () => {
  it("leitet Pfad und Query unveraendert an den Workspace-Service weiter", async () => {
    const calls = stubFetch([() => jsonResponse(200, { ok: true })]);
    const res = fakeResponse();
    await proxyHandler()(
      { url: "/api/render/api/v1/agent/proposals?limit=5", method: "GET", headers: {} },
      res,
    );

    expect(calls[0].url).toBe("https://workspace.example.test/api/v1/agent/proposals?limit=5");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("reicht nur die erlaubten Header weiter und ersetzt authorization", async () => {
    vi.stubEnv("WORKSPACE_SERVICE_TOKEN", "proxy-token");
    const calls = stubFetch([() => jsonResponse(200, { ok: true })]);
    await proxyHandler()(
      {
        url: "/api/render/api/v1/agent/run",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-github-token": "gh-token",
          "x-ai-provider": "openai",
          "x-ai-provider-key": "ai-key",
          "x-ai-provider-endpoint": "https://ai.example.test",
          "x-not-allowed": "drop-me",
          authorization: "Bearer client",
        },
        body: { prompt: "hi" },
      },
      fakeResponse(),
    );

    const headers = calls[0].init.headers ?? {};
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-github-token"]).toBe("gh-token");
    expect(headers["x-ai-provider"]).toBe("openai");
    expect(headers["x-ai-provider-key"]).toBe("ai-key");
    expect(headers["x-ai-provider-endpoint"]).toBe("https://ai.example.test");
    expect(headers["x-not-allowed"]).toBeUndefined();
    expect(headers.authorization).toBe("Bearer proxy-token");
  });

  it("ignoriert leere Header-Werte", async () => {
    const calls = stubFetch([() => jsonResponse(200, { ok: true })]);
    await proxyHandler()(
      {
        url: "/api/render/api/v1/agent/run",
        method: "POST",
        headers: { "content-type": "application/json", "x-github-token": "   " },
        body: {},
      },
      fakeResponse(),
    );

    expect(calls[0].init.headers?.["x-github-token"]).toBeUndefined();
  });

  it("sendet nur bei schreibenden Methoden einen Body", async () => {
    const calls = stubFetch([() => jsonResponse(200, { ok: true })]);
    const handler = proxyHandler();
    await handler({ url: "/api/render/api/v1/status", method: "GET", headers: {}, body: { x: 1 } }, fakeResponse());
    await handler({ url: "/api/render/api/v1/status", method: "PATCH", headers: {}, body: { x: 1 } }, fakeResponse());

    expect(calls[0].init.body).toBeUndefined();
    expect(calls[1].init.body).toBe(JSON.stringify({ x: 1 }));
  });

  it("gibt JSON-Antworten als Text mit Upstream-Status weiter", async () => {
    stubFetch([() => jsonResponse(422, { error: "ungueltig" })]);
    const res = fakeResponse();
    await proxyHandler()({ url: "/api/render/api/v1/agent/run", method: "POST", headers: {}, body: {} }, res);

    expect(res.statusCode).toBe(422);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(res.sentBody).toBe(JSON.stringify({ error: "ungueltig" }));
    expect(res.jsonBody).toBeUndefined();
  });

  it("reicht binaere Antworten als Buffer durch", async () => {
    stubFetch([
      () => new Response("dateiinhalt", { status: 200, headers: { "content-type": "application/octet-stream" } }),
    ]);
    const res = fakeResponse();
    await proxyHandler()({ url: "/api/render/api/v1/file", method: "GET", headers: {} }, res);

    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(Buffer.isBuffer(res.sentBody)).toBe(true);
    expect((res.sentBody as Buffer).toString()).toBe("dateiinhalt");
  });

  it("wiederholt einen Cold-Start-502 und antwortet danach normal", async () => {
    const calls = stubFetch([coldStartResponse, () => jsonResponse(200, { awake: true })]);
    const res = fakeResponse();
    await proxyHandler()({ url: "/api/render/api/v1/agent/proposals", method: "GET", headers: {} }, res);

    expect(calls).toHaveLength(2);
    expect(res.statusCode).toBe(200);
    expect(res.sentBody).toBe(JSON.stringify({ awake: true }));
  });

  it("antwortet nach zwei Cold-Start-502 mit 503", async () => {
    stubFetch([coldStartResponse, coldStartResponse]);
    const res = fakeResponse();
    await proxyHandler()({ url: "/api/render/api/v1/agent/proposals", method: "GET", headers: {} }, res);

    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.jsonBody)).toContain("Ruhemodus");
  });

  it("antwortet bei Netzwerkfehler mit 502", async () => {
    stubFetch([
      () => {
        throw new Error("socket hang up");
      },
    ]);
    const res = fakeResponse();
    await proxyHandler()({ url: "/api/render/api/v1/status", method: "GET", headers: {} }, res);

    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.jsonBody)).toContain("nicht erreichbar");
  });

  it("antwortet bei Timeout mit 502 und Cold-Start-Hinweis", async () => {
    stubFetch([
      () => {
        const error = new Error("timed out");
        error.name = "TimeoutError";
        throw error;
      },
    ]);
    const res = fakeResponse();
    await proxyHandler()({ url: "/api/render/api/v1/status", method: "GET", headers: {} }, res);

    expect(res.statusCode).toBe(502);
    expect(JSON.stringify(res.jsonBody)).toContain("Cold-Start");
  });
});
