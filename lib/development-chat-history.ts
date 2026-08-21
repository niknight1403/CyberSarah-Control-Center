import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { getDevelopmentChatHistoryKey, getDevelopmentChatHistoryScope, splitProtectedHistory } from "./development-chat-history-logic";

export * from "./development-chat-history-logic";

const PROTECTED_HISTORY_MANIFEST_KEY = "custom-ai-studio.development-chat.manifest.v1";
const PROTECTED_HISTORY_CHUNK_PREFIX = "custom-ai-studio.development-chat.chunk.v1.";

function supportsProtectedHistory() {
  return Platform.OS !== "web";
}

function getProtectedHistoryKeys(workspaceId?: string) {
  const scope = getDevelopmentChatHistoryScope(workspaceId);
  return { manifest: `${PROTECTED_HISTORY_MANIFEST_KEY}.${scope}`, chunkPrefix: `${PROTECTED_HISTORY_CHUNK_PREFIX}${scope}.` };
}

async function removeProtectedHistory(workspaceId?: string) {
  if (!supportsProtectedHistory()) return;
  const keys = getProtectedHistoryKeys(workspaceId);
  const manifestRaw = await SecureStore.getItemAsync(keys.manifest);
  const count = manifestRaw ? Number.parseInt(manifestRaw, 10) : 0;
  await Promise.all(Array.from({ length: Number.isFinite(count) ? Math.min(count, 96) : 0 }, (_, index) => SecureStore.deleteItemAsync(`${keys.chunkPrefix}${index}`)));
  await SecureStore.deleteItemAsync(keys.manifest);
}

async function readProtectedHistory(workspaceId?: string): Promise<string | null> {
  if (!supportsProtectedHistory()) return null;
  const keys = getProtectedHistoryKeys(workspaceId);
  const manifestRaw = await SecureStore.getItemAsync(keys.manifest);
  const count = manifestRaw ? Number.parseInt(manifestRaw, 10) : 0;
  if (!Number.isInteger(count) || count < 1 || count > 96) return null;
  const chunks = await Promise.all(Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${keys.chunkPrefix}${index}`)));
  return chunks.every((chunk) => typeof chunk === "string") ? chunks.join("") : null;
}

async function writeProtectedHistory(value: string, workspaceId?: string) {
  const chunks = splitProtectedHistory(value);
  if (!chunks.length || chunks.length > 96) throw new Error("Der geschützte Chat-Verlauf ist zu groß.");
  const keys = getProtectedHistoryKeys(workspaceId);
  await removeProtectedHistory(workspaceId);
  await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(`${keys.chunkPrefix}${index}`, chunk, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })));
  await SecureStore.setItemAsync(keys.manifest, String(chunks.length), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}

export async function loadDevelopmentChatHistory(protectedMode: boolean, workspaceId?: string): Promise<string | null> {
  const historyKey = getDevelopmentChatHistoryKey(workspaceId);
  if (protectedMode && supportsProtectedHistory()) {
    const secured = await readProtectedHistory(workspaceId);
    if (secured) return secured;
    const standard = await AsyncStorage.getItem(historyKey);
    if (standard) {
      await writeProtectedHistory(standard, workspaceId);
      await AsyncStorage.removeItem(historyKey);
    }
    return standard;
  }
  const standard = await AsyncStorage.getItem(historyKey);
  if (standard || !supportsProtectedHistory()) return standard;
  const secured = await readProtectedHistory(workspaceId);
  if (secured) {
    await AsyncStorage.setItem(historyKey, secured);
    await removeProtectedHistory(workspaceId);
  }
  return secured;
}

export async function saveDevelopmentChatHistory(value: string, protectedMode: boolean, workspaceId?: string) {
  const historyKey = getDevelopmentChatHistoryKey(workspaceId);
  if (protectedMode && supportsProtectedHistory()) {
    await writeProtectedHistory(value, workspaceId);
    await AsyncStorage.removeItem(historyKey);
    return;
  }
  await AsyncStorage.setItem(historyKey, value);
  await removeProtectedHistory(workspaceId);
}

export async function clearDevelopmentChatHistory(workspaceId?: string) {
  await AsyncStorage.removeItem(getDevelopmentChatHistoryKey(workspaceId));
  await removeProtectedHistory(workspaceId);
}
