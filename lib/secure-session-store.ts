import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { SECURE_SESSION_KEYS, clearSessionTokens, loadSessionTokens, saveSessionTokens, type SecureSessionStore } from "@/lib/secure-session-logic";

export type SecureStoreOptions = {
  requireAuthentication?: boolean;
  authenticationPrompt?: string;
};

export type { SecureSessionStore } from "@/lib/secure-session-logic";
export { SECURE_SESSION_KEYS, clearSessionTokens, loadSessionTokens, saveSessionTokens } from "@/lib/secure-session-logic";

function getWebStorage(): Storage | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

function validateKey(key: string): string {
  const normalized = key.trim();
  if (!normalized || !/^[A-Za-z0-9._-]+$/.test(normalized)) throw new Error("Ungültiger sicherer Speicherschlüssel.");
  return normalized;
}

function validateValue(value: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Ein sicherer Speicherwert darf nicht leer sein.");
  return value;
}

export function supportsNativeSecureStore(): boolean {
  return Platform.OS !== "web";
}

export function createSecureSessionStore(): SecureSessionStore & { has: (key: string) => Promise<boolean>; isAvailable: () => Promise<boolean> } {
  const store = {
    async set(key: string, value: string, options?: SecureStoreOptions) {
      const safeKey = validateKey(key);
      const safeValue = validateValue(value);
      if (Platform.OS === "web") {
        getWebStorage()?.setItem(safeKey, safeValue);
        return;
      }
      await SecureStore.setItemAsync(safeKey, safeValue, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        ...(options?.requireAuthentication ? { requireAuthentication: true, authenticationPrompt: options.authenticationPrompt ?? "Authentifiziere dich, um geschützte Entwicklungsdaten zu speichern." } : {}),
      });
    },
    async get(key: string, options?: SecureStoreOptions) {
      const safeKey = validateKey(key);
      if (Platform.OS === "web") return getWebStorage()?.getItem(safeKey) ?? null;
      try {
        return await SecureStore.getItemAsync(safeKey, options?.requireAuthentication ? { requireAuthentication: true, authenticationPrompt: options.authenticationPrompt ?? "Authentifiziere dich, um geschützte Entwicklungsdaten zu lesen." } : undefined);
      } catch {
        return null;
      }
    },
    async remove(key: string) {
      const safeKey = validateKey(key);
      if (Platform.OS === "web") {
        getWebStorage()?.removeItem(safeKey);
        return;
      }
      await SecureStore.deleteItemAsync(safeKey);
    },
    async has(key: string) {
      return Boolean(await this.get(key));
    },
    async isAvailable() {
      if (Platform.OS === "web") return getWebStorage() !== null;
      return SecureStore.isAvailableAsync();
    },
  };
  return store;
}

export const secureSessionStore = createSecureSessionStore();

void SECURE_SESSION_KEYS;
void saveSessionTokens;
void loadSessionTokens;
void clearSessionTokens;
