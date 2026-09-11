import { describe, expect, it } from "vitest";

import { useStudioSettings } from "../lib/studio-settings";
import * as chatHistory from "../lib/development-chat-history";
import * as liveRuntime from "../lib/live-runtime-client";
import * as pushNotifications from "../lib/push-notifications";

/**
 * Sprint-83-Vorbereitung — Vitest-Konfiguration mit RN-Stub.
 *
 * Diese Module importieren transitiv react-native-/Expo-Pakete
 * (AsyncStorage, SecureStore, Router, Platform). Ohne die Alias-Stubs in
 * vitest.config.ts schlagen diese Importe in der Node-Umgebung fehl
 * ("Cannot find package '@/lib/…'" bzw. React-Native-Laufzeitfehler).
 * Der Test bewacht, dass die Konfiguration das weiterhin abdeckt.
 */
describe("vitest rn-import-regression", () => {
  it("löst RN-abhängige Importketten ohne react-native-Fehler auf", () => {
    expect(typeof useStudioSettings).toBe("function");
    expect(chatHistory).toBeTruthy();
    expect(liveRuntime).toBeTruthy();
    expect(pushNotifications).toBeTruthy();
  });

  it("liefert statische RN-Exporte und nicht-thenbare Stubs", async () => {
    const { Platform, Pressable, useColorScheme } = await import("react-native");
    expect(typeof Platform.select).toBe("function");
    expect(Platform.OS === "ios").toBe(false); // Proxy, kein "ios"
    expect(typeof Pressable).toBe("function");
    expect(useColorScheme()).toBe("light");

    // Default-Import (AsyncStorage-Muster): aufrufbar, await haengt nicht
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const wert = await AsyncStorage.getItem("schluessel");
    expect(wert).toBeTruthy();

    // Namespace-Import (SecureStore-Muster): statische Exporte vorhanden
    const SecureStore = await import("expo-secure-store");
    expect(typeof SecureStore.setItemAsync).toBe("function");
    const verfuegbar = await SecureStore.isAvailableAsync();
    expect(verfuegbar).toBeTruthy();

    // Dokument-Picker bricht deterministisch ab
    const DocumentPicker = await import("expo-document-picker");
    expect(await DocumentPicker.getDocumentAsync()).toEqual({ canceled: true, assets: [] });
  });
});
