import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Platform, secureStorageValues, setUseTestStorageValues } from "./stubs/react-native-stub.mjs";

import {
  apiCall,
  establishSession,
  exchangeOAuthCode,
  getMe,
  logout,
} from "../lib/_core/api";
import { SESSION_TOKEN_KEY } from "../constants/oauth";

/**
 * Sprint 356 — HTTP-Client der Client-Auth-Bruecke (`lib/_core/api.ts`).
 *
 * Der Client war ungetestet (0 % Lines). Diese Suite sichert die
 * Vertragspunkte, die im Betrieb schon Fehler verursacht haben: Bearer-Header
 * aus dem gespeicherten Session-Token, klare Fehlermeldungen statt roher
 * SyntaxError bei HTML-Antworten, uebersetzte Netzwerkfehler sowie die
 * Endpunkt-Vertraege von Logout, `me`, OAuth-Tausch und Session-Cookie.
 */

function memoryStorage(initial?: [string, string]) {
  const values = new Map<string, string>();
  if (initial) values.set(initial[0], initial[1]);
  return {
    values,
    api: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
  };
}

function jsonResponse(body: unknown, init: { status?: number; contentType?: string } = {}) {
  const status = init.status ?? 200;
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? (init.contentType ?? "application/json") : null) },
    text: async () => text,
  } as unknown as Response;
}

describe("core api client", () => {
  beforeEach(() => {
    Platform.OS = "web";
    setUseTestStorageValues(true);
    secureStorageValues.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    secureStorageValues.clear();
    setUseTestStorageValues(false);
    Platform.OS = "web";
  });

  it("sendet den gespeicherten Session-Token als Bearer-Header", async () => {
    const storage = memoryStorage([SESSION_TOKEN_KEY, "session-token-42"]);
    vi.stubGlobal("window", { localStorage: storage.api });
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiCall<{ ok: boolean }>("/api/ping")).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.cybersarah-ki.com/api/ping");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer session-token-42");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.credentials).toBe("include");
  });

  it("laesst den Bearer-Header ohne Token weg und normalisiert den Pfad", async () => {
    vi.stubGlobal("window", { localStorage: memoryStorage().api });
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await apiCall("api/list");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith("/api/list")).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("uebernimmt JSON-Fehlermeldungen des Servers", async () => {
    vi.stubGlobal("window", { localStorage: memoryStorage().api });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "Nicht autorisiert" }, { status: 401 })));

    await expect(apiCall("/api/private")).rejects.toThrow("Nicht autorisiert");
  });

  it("faellt bei Textfehlern auf den Antworttext und dann auf den Status zurueck", async () => {
    vi.stubGlobal("window", { localStorage: memoryStorage().api });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse("Kaputt", { status: 500, contentType: "text/plain" })));

    await expect(apiCall("/api/x")).rejects.toThrow("Kaputt");

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse("", { status: 503, contentType: "text/plain" })));
    await expect(apiCall("/api/x")).rejects.toThrow("API call failed");
  });

  it("meldet HTML-Antworten als erreichbarkeitsproblem statt als SyntaxError", async () => {
    vi.stubGlobal("window", { localStorage: memoryStorage().api });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse("<!DOCTYPE html><html></html>", { contentType: "text/html" })));

    await expect(apiCall("/api/data")).rejects.toThrow(/Server-URL prüfen/);
  });

  it("uebersetzt Netzwerkfehler in eine handlungsleitende Meldung", async () => {
    vi.stubGlobal("window", { localStorage: memoryStorage().api });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));

    await expect(apiCall("/api/data")).rejects.toThrow(/Server nicht erreichbar/);
  });

  it("reicht fremde Fehlertypen unveraendert weiter", async () => {
    vi.stubGlobal("window", { localStorage: memoryStorage().api });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw "kein Error-Objekt";
    }));

    await expect(apiCall("/api/data")).rejects.toThrow("Unknown error occurred");
  });

  it("tauscht den OAuth-Code gegen einen Session-Token", async () => {
    vi.stubGlobal("window", { localStorage: memoryStorage().api });
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ app_session_id: "sess-9", user: { id: 1 } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchangeOAuthCode("code 1", "state/2");

    expect(result).toEqual({ sessionToken: "sess-9", user: { id: 1 } });
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toContain("/api/oauth/mobile?code=code+1&state=state%2F2");
  });

  it("beendet die Sitzung per POST", async () => {
    vi.stubGlobal("window", { localStorage: memoryStorage().api });
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    await logout();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/auth/logout");
    expect(init.method).toBe("POST");
  });

  it("liefert den Nutzer aus `me` und null bei Fehlern", async () => {
    vi.stubGlobal("window", { localStorage: memoryStorage().api });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ user: { id: 3, role: "admin" } })));
    await expect(getMe()).resolves.toEqual({ id: 3, role: "admin" });

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "weg" }, { status: 403 })));
    await expect(getMe()).resolves.toBeNull();

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({}, { status: 200 })));
    await expect(getMe()).resolves.toBeNull();
  });

  it("meldet Erfolg oder Fehlschlag beim Setzen des Session-Cookies", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => ({ ok: true } as Response));
    vi.stubGlobal("fetch", fetchMock);

    await expect(establishSession("token-xyz")).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://app.cybersarah-ki.com/api/auth/session");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-xyz");

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false } as Response)));
    await expect(establishSession("token-xyz")).resolves.toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Network request failed");
    }));
    await expect(establishSession("token-xyz")).resolves.toBe(false);
  });
});
