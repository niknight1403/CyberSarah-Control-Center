/**
 * Universeller Node-Stub fuer React-Native- und Expo-Module in Vitest.
 *
 * Logik-Module (`lib/`, `lib/_core/`) importieren teilweise react-native-/
 * Expo-Pakete. In der Node-Testumgebung sind diese Pakete nicht lauffaehig:
 * Die Sourcen sind Flow/JSX und laden nativen Code nach. Die Vitest-
 * Konfiguration mappt deshalb die folgenden Pakete auf diese Datei:
 *
 *   react-native, react-native-safe-area-context,
 *   @react-native-async-storage/async-storage, expo, expo-<modul>[/<pfad>]
 *
 * Funktionsweise:
 * - Die in `lib/` statisch importierten Namen (Platform, Appearance, View,
 *   Pressable, useColorScheme) existieren als echte ES-Exporte, damit
 *   statische Named-Imports ohne Fehler aufgeloest werden.
 * - Alle Namespaces sind als `default`-Export mit einem aufrufbaren,
 *   verschachtelbaren Proxy hinterlegt: jede weitere Eigenschaft ist
 *   aufrufbar und liefert wieder einen Stub.
 * - `then`/`catch`/`finally` werden bewusst NICHT bedient, damit ein Stub
 *   nie versehentlich als Promise-Thenable wirkt und `await` haengen bleibt.
 */
"use strict";

function makeStub(name) {
  const handler = {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return undefined;
      }
      if (prop === Symbol.toPrimitive) {
        return () => `[stub:${name}]`;
      }
      if (prop === "toString" || prop === "valueOf") {
        return () => `[stub:${name}]`;
      }
      if (prop === "constructor" || prop === "prototype") {
        return target;
      }
      return makeStub(`${name}.${String(prop)}`);
    },
    apply() {
      return makeStub(`${name}()`);
    },
    construct() {
      return makeStub(`${name} (instanz)`);
    },
  };

  const callable = function stubAufruf() {};
  return new Proxy(callable, handler);
}

export default makeStub("react-native-stub");

// --- Statisch importierte react-native-Namen (vgl. lib/, lib/_core/) ---
export const Appearance = makeStub("Appearance");
export const Platform = makeStub("Platform");
export const Pressable = makeStub("Pressable");
export const View = makeStub("View");
export const useColorScheme = () => "light";

// --- @react-native-async-storage/async-storage (Default-Import) ---
// AsyncStorage selbst ist der default-Export (Proxy); diese Namen dienen
// nur der Vollstaendigkeit, falls ein Test explizit named importiert.
export const getItem = makeStub("AsyncStorage.getItem");
export const setItem = makeStub("AsyncStorage.setItem");
export const removeItem = makeStub("AsyncStorage.removeItem");

// --- expo-secure-store (import * as SecureStore) ---
export const setItemAsync = makeStub("SecureStore.setItemAsync");
export const getItemAsync = makeStub("SecureStore.getItemAsync");
export const deleteItemAsync = makeStub("SecureStore.deleteItemAsync");
export const isAvailableAsync = makeStub("SecureStore.isAvailableAsync");
export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = makeStub("SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY");

// --- expo-file-system/legacy (import * as FileSystem) ---
export const documentDirectory = "[stub:documentDirectory]";
export const cacheDirectory = "[stub:cacheDirectory]";
export const readAsStringAsync = makeStub("FileSystem.readAsStringAsync");
export const writeAsStringAsync = makeStub("FileSystem.writeAsStringAsync");
export const EncodingType = makeStub("FileSystem.EncodingType");

// --- expo-document-picker (import * as DocumentPicker) ---
/** Abgebrochene Auswahl — sicherste Semantik fuer Logik-Tests. */
export const getDocumentAsync = () => ({ canceled: true, assets: [] });
export const DocumentPickerResult = makeStub("DocumentPicker.DocumentPickerResult");

// --- expo-router & Co. ---
export const router = makeStub("expo-router.router");
export const Stack = makeStub("expo-router.Stack");
export const useLocalSearchParams = () => ({});
export const usePathname = () => "/";
