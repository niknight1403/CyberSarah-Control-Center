import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Platform, secureStorageValues, setUseTestStorageValues } from "./stubs/react-native-stub.mjs";

import {
  clearUserInfo,
  getSessionToken,
  getUserInfo,
  removeSessionToken,
  setSessionToken,
  setUserInfo,
  type User,
} from "../lib/_core/auth";
import { SESSION_TOKEN_KEY, USER_INFO_KEY } from "../constants/oauth";

/**
 * Sprint 356 — Session-Speicher der Client-Auth-Bruecke.
 *
 * `lib/_core/auth.ts` lief bisher komplett ohne Test (0 % Lines), obwohl dort
 * der Session-Token und die Nutzerdaten fuer Web und Native abgelegt werden.
 * Abgedeckt werden beide Plattformpfade, Fehlerfaelle sowie die
 * Protokoll-Hygiene: weder Token-Fragmente noch Nutzerdaten duerfen im Log
 * auftauchen.
 */

type MemoryStorage = {
  values: Map<string, string>;
  api: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
};

function createLocalStorage(): MemoryStorage {
  const values = new Map<string, string>();
  return {
    values,
    api: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
  };
}

function installWindow(localStorageApi: MemoryStorage["api"]): void {
  vi.stubGlobal("window", { localStorage: localStorageApi });
}

const testUser: User = {
  id: 7,
  openId: "owner-open-id",
  name: "CyberSarah Owner",
  email: "owner@example.test",
  loginMethod: "oauth",
  role: "admin",
  lastSignedIn: new Date("2026-11-05T03:00:00.000Z"),
};

describe("auth session storage", () => {
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
    // isolate:false — dokumentierten Web-Default fuer Nachbardateien herstellen.
    Platform.OS = "web";
  });

  it("liest und schreibt den Session-Token im Web aus localStorage", async () => {
    const storage = createLocalStorage();
    installWindow(storage.api);

    await setSessionToken("web-token-123");
    expect(storage.values.get(SESSION_TOKEN_KEY)).toBe("web-token-123");
    await expect(getSessionToken()).resolves.toBe("web-token-123");

    await removeSessionToken();
    expect(storage.values.has(SESSION_TOKEN_KEY)).toBe(false);
    await expect(getSessionToken()).resolves.toBeNull();
  });

  it("nutzt auf Native SecureStore und entfernt den Token dort wieder", async () => {
    installWindow(createLocalStorage().api);
    Platform.OS = "ios";

    await setSessionToken("native-token-abc");
    expect(secureStorageValues.get(SESSION_TOKEN_KEY)).toBe("native-token-abc");
    await expect(getSessionToken()).resolves.toBe("native-token-abc");

    await removeSessionToken();
    expect(secureStorageValues.has(SESSION_TOKEN_KEY)).toBe(false);
    await expect(getSessionToken()).resolves.toBeNull();
  });

  it("liefert null statt zu werfen, wenn der Web-Storage blockiert ist", async () => {
    vi.stubGlobal("window", {
      get localStorage(): never {
        throw new Error("blocked by policy");
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getSessionToken()).resolves.toBeNull();
    // setSessionToken reicht den Speicherfehler bewusst weiter.
    await expect(setSessionToken("token")).rejects.toThrow("blocked by policy");
    // removeSessionToken schluckt ihn (Best-Effort-Logout).
    await expect(removeSessionToken()).resolves.toBeUndefined();
  });

  it("protokolliert weder Token-Fragmente noch Nutzerdaten", async () => {
    installWindow(createLocalStorage().api);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    Platform.OS = "ios";
    await setSessionToken("sekret-token-0123456789");
    await getSessionToken();
    await removeSessionToken();
    await setUserInfo(testUser);
    await getUserInfo();

    const output = [...log.mock.calls, ...error.mock.calls]
      .flat()
      .map((entry) => String(entry))
      .join(" ");
    expect(output).not.toContain("sekret-token");
    expect(output).not.toContain(testUser.email);
    expect(output).not.toContain(testUser.openId);
    expect(output).not.toContain(testUser.name);
  });

  it("speichert und liest Nutzerdaten im Web als JSON", async () => {
    const storage = createLocalStorage();
    installWindow(storage.api);

    await setUserInfo(testUser);
    const raw = storage.values.get(USER_INFO_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).email).toBe(testUser.email);

    const loaded = await getUserInfo();
    expect(loaded?.email).toBe(testUser.email);
    expect(loaded?.role).toBe("admin");

    await clearUserInfo();
    expect(storage.values.has(USER_INFO_KEY)).toBe(false);
    await expect(getUserInfo()).resolves.toBeNull();
  });

  it("nutzt auf Native SecureStore fuer Nutzerdaten", async () => {
    installWindow(createLocalStorage().api);
    Platform.OS = "android";

    await setUserInfo(testUser);
    expect(secureStorageValues.get(USER_INFO_KEY)).toBeTruthy();
    const loaded = await getUserInfo();
    expect(loaded?.openId).toBe(testUser.openId);

    await clearUserInfo();
    expect(secureStorageValues.has(USER_INFO_KEY)).toBe(false);
    await expect(getUserInfo()).resolves.toBeNull();
  });

  it("verwirft kaputte Nutzerdaten ohne Absturz", async () => {
    const storage = createLocalStorage();
    storage.values.set(USER_INFO_KEY, "{kein json");
    installWindow(storage.api);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getUserInfo()).resolves.toBeNull();
    // Der fehlerhafte Eintrag bleibt bestehen; ein Logout raeumt ihn ab.
    expect(storage.values.get(USER_INFO_KEY)).toBe("{kein json");
    await clearUserInfo();
    expect(storage.values.has(USER_INFO_KEY)).toBe(false);
  });

  it("meldet fehlende Nutzerdaten als null", async () => {
    installWindow(createLocalStorage().api);
    await expect(getUserInfo()).resolves.toBeNull();
  });
});
