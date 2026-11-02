import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { Platform, secureStorageValues, setUseTestStorageValues } from "./stubs/react-native-stub.mjs";

import { createSecureSessionStore, secureSessionStore, supportsNativeSecureStore } from "../lib/secure-session-store";

/**
 * Sprint 194 — Secure-Session-Store (Plattform-Bruecke).
 *
 * Die reine Token-Logik (`secure-session-logic`) ist separat getestet; hier
 * geht es um die Plattform-Bruecke: Web faellt auf sessionStorage zurueck,
 * nativ nutzt SecureStore, und beide Pfade validieren Schluessel/Werte
 * bevor etwas gespeichert wird.
 */

function createWebStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

const originalSessionStorage = (globalThis as { sessionStorage?: Storage }).sessionStorage;

function useWebStorage(): Storage {
  const storage = createWebStorage();
  (globalThis as { sessionStorage?: Storage }).sessionStorage = storage;
  return storage;
}

describe("secure-session-store", () => {
  beforeEach(() => {
    Platform.OS = "web";
    setUseTestStorageValues(true);
    secureStorageValues.clear();
    useWebStorage();
  });

  afterAll(() => {
    // isolate:false — geteilten RN-Stub fuer spaetere Dateien zuruecksetzen.
    Platform.OS = "web";
    setUseTestStorageValues(false);
    (globalThis as { sessionStorage?: Storage }).sessionStorage = originalSessionStorage;
  });

  it("speichert auf Web in sessionStorage und liest/loescht dort", async () => {
    const store = createSecureSessionStore();
    await store.set("cybersarah.session.access-token.v1", "token-abc");

    expect(globalThis.sessionStorage.getItem("cybersarah.session.access-token.v1")).toBe("token-abc");
    expect(await store.get("cybersarah.session.access-token.v1")).toBe("token-abc");
    expect(await store.has("cybersarah.session.access-token.v1")).toBe(true);
    expect(secureStorageValues.size).toBe(0);

    await store.remove("cybersarah.session.access-token.v1");
    expect(await store.get("cybersarah.session.access-token.v1")).toBeNull();
    expect(await store.has("cybersarah.session.access-token.v1")).toBe(false);
  });

  it("liefert auf Web ohne sessionStorage null statt zu werfen", async () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = undefined;
    const store = createSecureSessionStore();

    await expect(store.set("session.id", "value")).resolves.toBeUndefined();
    expect(await store.get("session.id")).toBeNull();
    await expect(store.remove("session.id")).resolves.toBeUndefined();
    expect(await store.isAvailable()).toBe(false);
  });

  it("meldet Web-Verfuegbarkeit anhand von sessionStorage", async () => {
    const store = createSecureSessionStore();
    expect(await store.isAvailable()).toBe(true);

    (globalThis as { sessionStorage?: Storage }).sessionStorage = undefined;
    expect(await store.isAvailable()).toBe(false);
  });

  it("nutzt auf nativen Plattformen SecureStore statt sessionStorage", async () => {
    Platform.OS = "ios";
    const storage = globalThis.sessionStorage;
    const store = createSecureSessionStore();

    await store.set("cybersarah.session.refresh-token.v1", "refresh-1");
    expect(secureStorageValues.get("cybersarah.session.refresh-token.v1")).toBe("refresh-1");
    expect(storage.length).toBe(0);
    expect(await store.get("cybersarah.session.refresh-token.v1")).toBe("refresh-1");
    expect(await store.has("cybersarah.session.refresh-token.v1")).toBe(true);

    await store.remove("cybersarah.session.refresh-token.v1");
    expect(secureStorageValues.has("cybersarah.session.refresh-token.v1")).toBe(false);
    expect(await store.get("cybersarah.session.refresh-token.v1")).toBeNull();
  });

  it("akzeptiert biometrische Optionen auf dem nativen Pfad", async () => {
    Platform.OS = "android";
    const store = createSecureSessionStore();

    await store.set("cybersarah.session.id.v1", "session-7", {
      requireAuthentication: true,
      authenticationPrompt: "Bitte bestaetigen",
    });
    expect(secureStorageValues.get("cybersarah.session.id.v1")).toBe("session-7");
  });

  it("weist ungueltige Schluessel in allen Operationen zurueck", async () => {
    const store = createSecureSessionStore();

    await expect(store.set("", "value")).rejects.toThrow("Ungültiger sicherer Speicherschlüssel");
    await expect(store.set("   ", "value")).rejects.toThrow("Ungültiger sicherer Speicherschlüssel");
    await expect(store.set("mit leerzeichen", "value")).rejects.toThrow("Ungültiger sicherer Speicherschlüssel");
    await expect(store.set("bad/key", "value")).rejects.toThrow("Ungültiger sicherer Speicherschlüssel");
    await expect(store.get("")).rejects.toThrow("Ungültiger sicherer Speicherschlüssel");
    await expect(store.remove("umlaut-ä")).rejects.toThrow("Ungültiger sicherer Speicherschlüssel");
  });

  it("trims gueltige Schluessel vor dem Speichern", async () => {
    const store = createSecureSessionStore();
    await store.set("  cybersarah.session.id.v1  ", "session-9");

    expect(await store.get("cybersarah.session.id.v1")).toBe("session-9");
    expect(globalThis.sessionStorage.getItem("cybersarah.session.id.v1")).toBe("session-9");
  });

  it("weist leere Werte zurueck, auch auf dem nativen Pfad", async () => {
    Platform.OS = "ios";
    const store = createSecureSessionStore();

    await expect(store.set("session.id", "")).rejects.toThrow("darf nicht leer sein");
    await expect(store.set("session.id", "   ")).rejects.toThrow("darf nicht leer sein");
    expect(secureStorageValues.size).toBe(0);
  });

  it("behaelt Leerzeichen innerhalb eines Werts unveraendert", async () => {
    const store = createSecureSessionStore();
    await store.set("session.id", "  token mit rand  ");

    expect(await store.get("session.id")).toBe("  token mit rand  ");
  });

  it("erkennt native SecureStore-Verfuegbarkeit", async () => {
    expect(supportsNativeSecureStore()).toBe(false);
    Platform.OS = "ios";
    expect(supportsNativeSecureStore()).toBe(true);
    expect(await createSecureSessionStore().isAvailable()).toBeTruthy();
  });

  it("teilt den Speicher zwischen Instanzen und dem Singleton", async () => {
    const ersterStore = createSecureSessionStore();
    const zweiterStore = createSecureSessionStore();

    await ersterStore.set("cybersarah.session.access-token.v1", "shared");
    expect(await zweiterStore.get("cybersarah.session.access-token.v1")).toBe("shared");
    expect(await secureSessionStore.get("cybersarah.session.access-token.v1")).toBe("shared");
  });
});
