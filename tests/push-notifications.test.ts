import { beforeEach, describe, expect, it, vi } from "vitest";

import { Platform } from "./stubs/react-native-stub.mjs";

const notifications = vi.hoisted(() => {
  const listeners: {
    received: Array<(value: unknown) => void>;
    response: Array<(value: unknown) => void>;
  } = { received: [], response: [] };
  const state = { os: "ios" as string, expoConfig: undefined as unknown, easConfig: undefined as unknown };
  return {
    state,
    listeners,
    setNotificationChannelAsync: vi.fn(async () => undefined),
    getPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
    requestPermissionsAsync: vi.fn(async () => ({ status: "granted" })),
    getExpoPushTokenAsync: vi.fn(async () => ({ data: "ExponentPushToken[abc]" })),
    scheduleNotificationAsync: vi.fn(async () => "notification-id"),
    addNotificationReceivedListener: vi.fn((handler: (value: unknown) => void) => {
      listeners.received.push(handler);
      return {
        remove: vi.fn(() => {
          listeners.received = listeners.received.filter((it) => it !== handler);
        }),
      };
    }),
    addNotificationResponseReceivedListener: vi.fn((handler: (value: unknown) => void) => {
      listeners.response.push(handler);
      return {
        remove: vi.fn(() => {
          listeners.response = listeners.response.filter((it) => it !== handler);
        }),
      };
    }),
  };
});

/**
 * Die Vitest-Konfiguration mappt alle react-native-/Expo-Pakete auf denselben
 * Stub. Ein `vi.mock` auf `expo-notifications` oder `expo-constants` wuerde
 * deshalb auch den Stub selbst ersetzen. Darum wird hier genau dieser Pfad
 * gemockt und um die Expo-Oberflaeche erweitert, die die Bruecke importiert.
 */
vi.mock("./stubs/react-native-stub.mjs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stubs/react-native-stub.mjs")>();
  return {
    ...actual,
    Platform: {
      get OS() {
        return notifications.state.os;
      },
      set OS(value: string) {
        notifications.state.os = value;
      },
      select: (options: Record<string, unknown>) => options.default,
    },
    default: {
      get expoConfig() {
        return notifications.state.expoConfig;
      },
      get easConfig() {
        return notifications.state.easConfig;
      },
    },
    AndroidImportance: { MAX: 5 },
    setNotificationChannelAsync: notifications.setNotificationChannelAsync,
    getPermissionsAsync: notifications.getPermissionsAsync,
    requestPermissionsAsync: notifications.requestPermissionsAsync,
    getExpoPushTokenAsync: notifications.getExpoPushTokenAsync,
    scheduleNotificationAsync: notifications.scheduleNotificationAsync,
    addNotificationReceivedListener: notifications.addNotificationReceivedListener,
    addNotificationResponseReceivedListener: notifications.addNotificationResponseReceivedListener,
  };
});

import {
  notifyReleaseStatus,
  registerForPushNotifications,
  resolveExpoProjectId,
  subscribeToPushNotifications,
} from "../lib/push-notifications";

/**
 * Sprint 195 — Push-Benachrichtigungen (Plattform-Bruecke).
 *
 * `lib/push-notifications.ts` war die letzte vollstaendig ungetestete
 * Expo-Bruecke (0 % Lines) und wird produktiv ueber
 * `hooks/use-push-notifications.ts` genutzt. Die reine Textlogik
 * (`push-notifications-logic`) und die Release-Texte sind separat getestet;
 * hier geht es um Registrierung, Kanal-Einrichtung, Fehlerpfade, Versand und
 * Listener-Verwaltung inklusive Aufraeumen.
 */

/** Setzt alle Expo-Mocks und Plattform-Einstellungen auf den Ausgangszustand. */
function resetMocks() {
  Platform.OS = "ios";
  notifications.state.expoConfig = { extra: { eas: { projectId: "  project-123  " } } };
  notifications.state.easConfig = undefined;
  notifications.getPermissionsAsync.mockResolvedValue({ status: "granted" });
  notifications.requestPermissionsAsync.mockResolvedValue({ status: "granted" });
  notifications.getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[abc]" });
  notifications.listeners.received = [];
  notifications.listeners.response = [];
  vi.clearAllMocks();
  notifications.listeners.received = [];
  notifications.listeners.response = [];
}

describe("resolveExpoProjectId", () => {
  beforeEach(resetMocks);

  it("liest und trimmt die Projekt-ID aus expoConfig.extra.eas", () => {
    expect(resolveExpoProjectId()).toBe("project-123");
  });

  it("faellt auf easConfig.projectId zurueck, wenn expoConfig keine ID liefert", () => {
    notifications.state.expoConfig = undefined;
    notifications.state.easConfig = { projectId: "fallback-456" };
    expect(resolveExpoProjectId()).toBe("fallback-456");
  });

  it("liefert null ohne Konfiguration", () => {
    notifications.state.expoConfig = undefined;
    notifications.state.easConfig = undefined;
    expect(resolveExpoProjectId()).toBeNull();
  });

  it("liefert null fuer leere, nur aus Leerzeichen bestehende oder nicht-string Werte", () => {
    notifications.state.expoConfig = { extra: { eas: { projectId: "   " } } };
    notifications.state.easConfig = undefined;
    expect(resolveExpoProjectId()).toBeNull();

    notifications.state.expoConfig = { extra: { eas: { projectId: "" } } };
    expect(resolveExpoProjectId()).toBeNull();

    notifications.state.expoConfig = { extra: { eas: { projectId: 42 } } };
    expect(resolveExpoProjectId()).toBeNull();
  });
});

describe("registerForPushNotifications", () => {
  beforeEach(resetMocks);

  it("meldet im Web fehlende Unterstuetzung, ohne Expo aufzurufen", async () => {
    Platform.OS = "web";

    const result = await registerForPushNotifications();

    expect(result).toEqual({ supported: false, permission: "denied", token: null, reason: "web" });
    expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it("legt auf Android zuerst den Standard-Kanal an und registriert danach den Token", async () => {
    Platform.OS = "android";

    const result = await registerForPushNotifications();

    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith("default", {
      name: "CyberSarah Control Center",
      importance: 5,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#8B7CFF",
    });
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "project-123" });
    expect(result).toEqual({ supported: true, permission: "granted", token: "ExponentPushToken[abc]" });
  });

  it("fragt die Berechtigung nur dann an, wenn sie noch nicht erteilt ist", async () => {
    await registerForPushNotifications();
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();

    notifications.getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    await registerForPushNotifications();
    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it("meldet fehlende Berechtigung ohne Token-Registrierung", async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    notifications.requestPermissionsAsync.mockResolvedValue({ status: "denied" });

    const result = await registerForPushNotifications();

    expect(result).toEqual({ supported: true, permission: "denied", token: null, reason: "permission-denied" });
    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("behaelt den Zustand 'undetermined', wenn der Nutzer nicht entschieden hat", async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    notifications.requestPermissionsAsync.mockResolvedValue({ status: "undetermined" });

    const result = await registerForPushNotifications();

    expect(result).toEqual({ supported: true, permission: "undetermined", token: null, reason: "permission-denied" });
  });

  it("meldet eine fehlende Expo-Projekt-ID nach erteilter Berechtigung", async () => {
    notifications.state.expoConfig = undefined;
    notifications.state.easConfig = undefined;

    const result = await registerForPushNotifications();

    expect(result).toEqual({ supported: true, permission: "granted", token: null, reason: "project-id-missing" });
    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("faengt Fehler der Token-Registrierung ab und bleibt berechtigt", async () => {
    notifications.getExpoPushTokenAsync.mockRejectedValue(new Error("network down"));

    const result = await registerForPushNotifications();

    expect(result).toEqual({ supported: true, permission: "granted", token: null, reason: "registration-failed" });
  });
});

describe("notifyReleaseStatus", () => {
  beforeEach(resetMocks);

  it("versendet im Web nichts und meldet false", async () => {
    Platform.OS = "web";

    await expect(notifyReleaseStatus("passed")).resolves.toBe(false);
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("plant nativ eine Sofort-Benachrichtigung mit Release-Inhalt", async () => {
    const result = await notifyReleaseStatus("failed", "  2 Tests rot  ");

    expect(result).toBe(true);
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: "CyberSarah: Release fehlgeschlagen",
        body: "Mindestens eine Release-Prüfung benötigt Aufmerksamkeit. 2 Tests rot",
        data: { kind: "release", status: "failed" },
      },
      trigger: null,
    });
  });
});

describe("subscribeToPushNotifications", () => {
  beforeEach(resetMocks);

  it("registriert nur die uebergebenen Handler", () => {
    subscribeToPushNotifications({});

    expect(notifications.addNotificationReceivedListener).not.toHaveBeenCalled();
    expect(notifications.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
  });

  it("leitet Empfang und Antwort an die Handler weiter", () => {
    const onReceived = vi.fn();
    const onResponse = vi.fn();

    subscribeToPushNotifications({ onReceived, onResponse });
    notifications.listeners.received.forEach((handler) => handler({ title: "empfangen" }));
    notifications.listeners.response.forEach((handler) => handler({ actionIdentifier: "default" }));

    expect(onReceived).toHaveBeenCalledWith({ title: "empfangen" });
    expect(onResponse).toHaveBeenCalledWith({ actionIdentifier: "default" });
  });

  it("entfernt beim Aufraeumen beide Listener", () => {
    const receivedRemove = vi.fn();
    const responseRemove = vi.fn();
    notifications.addNotificationReceivedListener.mockReturnValueOnce({ remove: receivedRemove });
    notifications.addNotificationResponseReceivedListener.mockReturnValueOnce({ remove: responseRemove });

    const unsubscribe = subscribeToPushNotifications({ onReceived: vi.fn(), onResponse: vi.fn() });
    unsubscribe();

    expect(receivedRemove).toHaveBeenCalledTimes(1);
    expect(responseRemove).toHaveBeenCalledTimes(1);
  });

  it("kommt ohne eingerichtete Listener beim Aufraeumen aus", () => {
    const unsubscribe = subscribeToPushNotifications({ onReceived: vi.fn() });

    expect(() => unsubscribe()).not.toThrow();
  });
});
