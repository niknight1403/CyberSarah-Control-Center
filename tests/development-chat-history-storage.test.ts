import { beforeEach, describe, expect, it, vi } from "vitest";

import { asyncStorageValues, Platform, secureStorageValues, setUseTestStorageValues } from "./stubs/react-native-stub.mjs";

import { clearDevelopmentChatHistory, loadDevelopmentChatHistory, saveDevelopmentChatHistory } from "../lib/development-chat-history";
import { getDevelopmentChatHistoryKey } from "../lib/development-chat-history-logic";

const manifest = (workspace?: string) => `custom-ai-studio.development-chat.manifest.v1.${workspace ?? "unattached"}`;
const chunk = (workspace: string | undefined, index: number) => `custom-ai-studio.development-chat.chunk.v1.${workspace ?? "unattached"}.${index}`;

describe("development chat history storage", () => {
  beforeEach(() => {
    Platform.OS = "web";
    setUseTestStorageValues(true);
    asyncStorageValues.clear();
    secureStorageValues.clear();
  });

  it("persists ordinary web history and clears it without using SecureStore", async () => {
    await saveDevelopmentChatHistory("web history", true, "repo-a");
    expect(await loadDevelopmentChatHistory(false, "repo-a")).toBe("web history");
    expect(secureStorageValues.size).toBe(0);
    await clearDevelopmentChatHistory("repo-a");
    expect(await loadDevelopmentChatHistory(false, "repo-a")).toBeNull();
  });

  it("moves existing native history into SecureStore when protected mode is enabled", async () => {
    Platform.OS = "ios";
    const key = getDevelopmentChatHistoryKey("repo-a");
    asyncStorageValues.set(key, "legacy protected history");
    expect(await loadDevelopmentChatHistory(true, "repo-a")).toBe("legacy protected history");
    expect(asyncStorageValues.has(key)).toBe(false);
    expect(secureStorageValues.get(manifest("repo-a"))).toBe("1");
    expect(secureStorageValues.get(chunk("repo-a", 0))).toBe("legacy protected history");
  });

  it("restores protected history to ordinary storage when protection is disabled", async () => {
    Platform.OS = "android";
    secureStorageValues.set(manifest("repo-b"), "1");
    secureStorageValues.set(chunk("repo-b", 0), "secured conversation");
    expect(await loadDevelopmentChatHistory(false, "repo-b")).toBe("secured conversation");
    expect(asyncStorageValues.get(getDevelopmentChatHistoryKey("repo-b"))).toBe("secured conversation");
    expect(secureStorageValues.has(manifest("repo-b"))).toBe(false);
  });

  it("ignores invalid manifests and removes corrupt protected data on save", async () => {
    Platform.OS = "ios";
    secureStorageValues.set(manifest(), "97");
    expect(await loadDevelopmentChatHistory(true)).toBeNull();
    secureStorageValues.set(manifest(), "1");
    secureStorageValues.set(chunk(undefined, 0), "stale");
    await saveDevelopmentChatHistory("replacement", true);
    expect(await loadDevelopmentChatHistory(true)).toBe("replacement");
    expect(secureStorageValues.get(manifest())).toBe("1");
  });

  it("keeps history scoped by workspace", async () => {
    Platform.OS = "ios";
    await saveDevelopmentChatHistory("alpha", true, "alpha");
    await saveDevelopmentChatHistory("beta", true, "beta");
    expect(await loadDevelopmentChatHistory(true, "alpha")).toBe("alpha");
    expect(await loadDevelopmentChatHistory(true, "beta")).toBe("beta");
  });
});
