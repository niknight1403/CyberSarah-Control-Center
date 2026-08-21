import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { DEVELOPMENT_CHAT_HISTORY_KEY, splitProtectedHistory } from "./development-chat-history-logic";

export * from "./development-chat-history-logic";

const PROTECTED_HISTORY_MANIFEST_KEY = "custom-ai-studio.development-chat.manifest.v1";
const PROTECTED_HISTORY_CHUNK_PREFIX = "custom-ai-studio.development-chat.chunk.v1.";

function supportsProtectedHistory() {
  return Platform.OS !== "web";
}

async function removeProtectedHistory() {
  if (!supportsProtectedHistory()) return;
  const manifestRaw = await SecureStore.getItemAsync(PROTECTED_HISTORY_MANIFEST_KEY);
  const count = manifestRaw ? Number.parseInt(manifestRaw, 10) : 0;
  await Promise.all(Array.from({ length: Number.isFinite(count) ? Math.min(count, 96) : 0 }, (_, index) => SecureStore.deleteItemAsync(`${PROTECTED_HISTORY_CHUNK_PREFIX}${index}`)));
  await SecureStore.deleteItemAsync(PROTECTED_HISTORY_MANIFEST_KEY);
}

async function readProtectedHistory(): Promise<string | null> {
  if (!supportsProtectedHistory()) return null;
  const manifestRaw = await SecureStore.getItemAsync(PROTECTED_HISTORY_MANIFEST_KEY);
  const count = manifestRaw ? Number.parseInt(manifestRaw, 10) : 0;
  if (!Number.isInteger(count) || count < 1 || count > 96) return null;
  const chunks = await Promise.all(Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${PROTECTED_HISTORY_CHUNK_PREFIX}${index}`)));
  return chunks.every((chunk) => typeof chunk === "string") ? chunks.join("") : null;
}

async function writeProtectedHistory(value: string) {
  const chunks = splitProtectedHistory(value);
  if (!chunks.length || chunks.length > 96) throw new Error("Der geschützte Chat-Verlauf ist zu groß.");
  await removeProtectedHistory();
  await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(`${PROTECTED_HISTORY_CHUNK_PREFIX}${index}`, chunk, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })));
  await SecureStore.setItemAsync(PROTECTED_HISTORY_MANIFEST_KEY, String(chunks.length), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

export async function loadDevelopmentChatHistory(protectedMode: boolean): Promise<string | null> {
  if (protectedMode && supportsProtectedHistory()) {
    const secured = await readProtectedHistory();
    if (secured) return secured;
    const standard = await AsyncStorage.getItem(DEVELOPMENT_CHAT_HISTORY_KEY);
    if (standard) {
      await writeProtectedHistory(standard);
      await AsyncStorage.removeItem(DEVELOPMENT_CHAT_HISTORY_KEY);
    }
    return standard;
  }
  const standard = await AsyncStorage.getItem(DEVELOPMENT_CHAT_HISTORY_KEY);
  if (standard || !supportsProtectedHistory()) return standard;
  const secured = await readProtectedHistory();
  if (secured) {
    await AsyncStorage.setItem(DEVELOPMENT_CHAT_HISTORY_KEY, secured);
    await removeProtectedHistory();
  }
  return secured;
}

export async function saveDevelopmentChatHistory(value: string, protectedMode: boolean) {
  if (protectedMode && supportsProtectedHistory()) {
    await writeProtectedHistory(value);
    await AsyncStorage.removeItem(DEVELOPMENT_CHAT_HISTORY_KEY);
    return;
  }
  await AsyncStorage.setItem(DEVELOPMENT_CHAT_HISTORY_KEY, value);
  await removeProtectedHistory();
}

export async function clearDevelopmentChatHistory() {
  await AsyncStorage.removeItem(DEVELOPMENT_CHAT_HISTORY_KEY);
  await removeProtectedHistory();
}
