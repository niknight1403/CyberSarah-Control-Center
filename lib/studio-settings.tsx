import AsyncStorage from "@react-native-async-storage/async-storage";
import { type AgentProposal, type RemoteCommit, type RemoteHealth, type RepositoryQuality, RemoteWorkspaceClient } from "@/lib/remote-workspace-client";
import { toPersistedStudioSettings, type ProviderId } from "@/lib/studio-settings-logic";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

const PREFERENCES_KEY = "custom-ai-studio.preferences.v1";
const SERVICE_ACCESS_TOKEN_KEY = "custom-ai-studio.service-access-token.v1";
const GITHUB_TOKEN_KEY = "custom-ai-studio.github-token.v1";
const PROVIDER_KEY_KEY = "custom-ai-studio.provider-key.v1";

export const providerOptions = [
  { id: "managed", label: "On-Server", detail: "Der Workspace-Service verwaltet den Provider." },
  { id: "openai", label: "OpenAI", detail: "API-Key verbleibt verschlüsselt auf dem Gerät." },
  { id: "groq", label: "Groq", detail: "API-Key verbleibt verschlüsselt auf dem Gerät." },
  { id: "together", label: "Together AI", detail: "API-Key verbleibt verschlüsselt auf dem Gerät." },
  { id: "anthropic", label: "Anthropic", detail: "API-Key verbleibt verschlüsselt auf dem Gerät." },
] as const;

export type { ProviderId } from "@/lib/studio-settings-logic";

export type StudioSettings = {
  workspaceUrl: string;
  repositoryUrl: string;
  branch: string;
  provider: ProviderId;
  workspaceId?: string;
  hasServiceAccessToken: boolean;
  hasGitHubToken: boolean;
  hasProviderKey: boolean;
  protectChatContent: boolean;
};

export type StudioSettingsInput = Omit<StudioSettings, "hasServiceAccessToken" | "hasGitHubToken" | "hasProviderKey" | "protectChatContent"> & {
  serviceAccessToken?: string;
  githubToken?: string;
  providerApiKey?: string;
  protectChatContent?: boolean;
};
export type RemoteWorkspaceChange = { path: string; content: string };

const defaultSettings: StudioSettings = {
  workspaceUrl: "",
  repositoryUrl: "",
  branch: "main",
  provider: "managed",
  hasServiceAccessToken: false,
  hasGitHubToken: false,
  hasProviderKey: false,
  protectChatContent: false,
};

async function writeSecureValue(key: string, value: string) {
  if (Platform.OS === "web") {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteSecureValue(key: string) {
  if (Platform.OS === "web") {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

async function hasSecureValue(key: string) {
  if (Platform.OS === "web") return typeof sessionStorage !== "undefined" && Boolean(sessionStorage.getItem(key));
  return Boolean(await SecureStore.getItemAsync(key));
}

async function readSecureValue(key: string) {
  if (Platform.OS === "web") return typeof sessionStorage !== "undefined" ? sessionStorage.getItem(key) : null;
  return SecureStore.getItemAsync(key);
}

type StudioSettingsContextValue = {
  settings: StudioSettings;
  loading: boolean;
  saveSettings: (input: StudioSettingsInput) => Promise<StudioSettings>;
  clearServiceAccessToken: () => Promise<void>;
  clearGitHubToken: () => Promise<void>;
  clearProviderKey: () => Promise<void>;
  attachRepository: (input: StudioSettingsInput) => Promise<{ workspaceId: string; branch: string; files: string[] }>;
  readAttachedFile: (path: string) => Promise<{ path: string; content: string }>;
  loadRepositoryDetails: () => Promise<{ currentBranch: string; branches: string[]; commits: RemoteCommit[]; remoteAhead: boolean; remoteCheckAvailable: boolean }>;
  switchRepositoryBranch: (branch: string) => Promise<{ branch: string; files: string[] }>;
  syncRemoteChanges: (changes: RemoteWorkspaceChange[]) => Promise<{ savedCount: number; status: string }>;
  commitRepository: (message: string) => Promise<{ hash: string }>;
  pushRepository: () => Promise<{ branch: string }>;
  createRepositoryPullRequest: (input: { baseBranch: string; title: string; body: string }) => Promise<{ number: number; url: string; headBranch: string; baseBranch: string }>;
  loadRepositoryQuality: () => Promise<RepositoryQuality>;
  loadWorkspaceHealth: () => Promise<RemoteHealth>;
  requestDevelopmentProposal: (input: { prompt: string; activeFile?: string }) => Promise<AgentProposal>;
  setProtectedChatContent: (enabled: boolean) => Promise<void>;
};

const StudioSettingsContext = createContext<StudioSettingsContextValue | undefined>(undefined);

export function StudioSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const stored = await AsyncStorage.getItem(PREFERENCES_KEY);
        const parsed = stored ? (JSON.parse(stored) as Partial<StudioSettings>) : {};
        const [hasServiceAccessToken, hasGitHubToken, hasProviderKey] = await Promise.all([
          hasSecureValue(SERVICE_ACCESS_TOKEN_KEY),
          hasSecureValue(GITHUB_TOKEN_KEY),
          hasSecureValue(PROVIDER_KEY_KEY),
        ]);
        setSettings({ ...defaultSettings, ...parsed, hasServiceAccessToken, hasGitHubToken, hasProviderKey });
      } finally {
        setLoading(false);
      }
    };
    void loadSettings();
  }, []);

  const saveSettings = useCallback(async (input: StudioSettingsInput) => {
    const nextSettings: StudioSettings = {
      ...toPersistedStudioSettings({ ...input, protectChatContent: input.protectChatContent ?? settings.protectChatContent }),
      workspaceId: settings.workspaceId,
      hasServiceAccessToken: input.serviceAccessToken?.trim() ? true : settings.hasServiceAccessToken,
      hasGitHubToken: input.githubToken?.trim() ? true : settings.hasGitHubToken,
      hasProviderKey: input.providerApiKey?.trim() ? true : settings.hasProviderKey,
    };

    if (input.serviceAccessToken?.trim()) await writeSecureValue(SERVICE_ACCESS_TOKEN_KEY, input.serviceAccessToken.trim());
    if (input.githubToken?.trim()) await writeSecureValue(GITHUB_TOKEN_KEY, input.githubToken.trim());
    if (input.providerApiKey?.trim()) await writeSecureValue(PROVIDER_KEY_KEY, input.providerApiKey.trim());

    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(nextSettings));
    setSettings(nextSettings);
    return nextSettings;
  }, [settings.hasGitHubToken, settings.hasProviderKey, settings.hasServiceAccessToken, settings.workspaceId]);

  const setProtectedChatContent = useCallback(async (enabled: boolean) => {
    const nextSettings = { ...settings, protectChatContent: enabled };
    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(nextSettings));
    setSettings(nextSettings);
  }, [settings]);

  const clearServiceAccessToken = useCallback(async () => {
    await deleteSecureValue(SERVICE_ACCESS_TOKEN_KEY);
    setSettings((current) => ({ ...current, hasServiceAccessToken: false }));
  }, []);

  const clearGitHubToken = useCallback(async () => {
    await deleteSecureValue(GITHUB_TOKEN_KEY);
    setSettings((current) => ({ ...current, hasGitHubToken: false }));
  }, []);

  const clearProviderKey = useCallback(async () => {
    await deleteSecureValue(PROVIDER_KEY_KEY);
    setSettings((current) => ({ ...current, hasProviderKey: false }));
  }, []);

  const attachRepository = useCallback(async (input: StudioSettingsInput) => {
    const storedSettings = await saveSettings(input);
    const [storedServiceToken, storedGitHubToken, storedProviderKey] = await Promise.all([
      readSecureValue(SERVICE_ACCESS_TOKEN_KEY),
      readSecureValue(GITHUB_TOKEN_KEY),
      readSecureValue(PROVIDER_KEY_KEY),
    ]);
    const client = new RemoteWorkspaceClient({
      baseUrl: storedSettings.workspaceUrl,
      serviceAccessToken: input.serviceAccessToken?.trim() || storedServiceToken || undefined,
      githubToken: input.githubToken?.trim() || storedGitHubToken || undefined,
      provider: storedSettings.provider,
      providerApiKey: input.providerApiKey?.trim() || storedProviderKey || undefined,
    });
    const attached = await client.attachRepository({ repositoryUrl: storedSettings.repositoryUrl, branch: storedSettings.branch });
    const files = (await client.listFiles(attached.workspaceId)).files;
    const nextSettings = { ...storedSettings, workspaceId: attached.workspaceId };
    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(nextSettings));
    setSettings(nextSettings);
    return { ...attached, files };
  }, [saveSettings]);

  const readAttachedFile = useCallback(async (path: string) => {
    if (!settings.workspaceUrl || !settings.workspaceId) throw new Error("Kein Repository ist mit dem Workspace-Service verbunden.");
    const [serviceAccessToken, githubToken, providerApiKey] = await Promise.all([
      readSecureValue(SERVICE_ACCESS_TOKEN_KEY),
      readSecureValue(GITHUB_TOKEN_KEY),
      readSecureValue(PROVIDER_KEY_KEY),
    ]);
    const client = new RemoteWorkspaceClient({
      baseUrl: settings.workspaceUrl,
      serviceAccessToken: serviceAccessToken || undefined,
      githubToken: githubToken || undefined,
      provider: settings.provider,
      providerApiKey: providerApiKey || undefined,
    });
    return client.getFile(settings.workspaceId, path);
  }, [settings.provider, settings.workspaceId, settings.workspaceUrl]);

  const createConnectedClient = useCallback(async () => {
    if (!settings.workspaceUrl || !settings.workspaceId) throw new Error("Kein Repository ist mit dem Workspace-Service verbunden.");
    const [serviceAccessToken, githubToken, providerApiKey] = await Promise.all([
      readSecureValue(SERVICE_ACCESS_TOKEN_KEY),
      readSecureValue(GITHUB_TOKEN_KEY),
      readSecureValue(PROVIDER_KEY_KEY),
    ]);
    return new RemoteWorkspaceClient({
      baseUrl: settings.workspaceUrl,
      serviceAccessToken: serviceAccessToken || undefined,
      githubToken: githubToken || undefined,
      provider: settings.provider,
      providerApiKey: providerApiKey || undefined,
    });
  }, [settings.provider, settings.workspaceId, settings.workspaceUrl]);

  const loadRepositoryDetails = useCallback(async () => {
    if (!settings.workspaceId) throw new Error("Kein Repository ist mit dem Workspace-Service verbunden.");
    const client = await createConnectedClient();
    const [branchState, commitState, gitStatus] = await Promise.all([
      client.listBranches(settings.workspaceId),
      client.listCommits(settings.workspaceId),
      client.getGitStatus(settings.workspaceId),
    ]);
    return { ...branchState, commits: commitState.commits, remoteAhead: gitStatus.remoteAhead, remoteCheckAvailable: gitStatus.remoteCheckAvailable };
  }, [createConnectedClient, settings.workspaceId]);

  const switchRepositoryBranch = useCallback(async (branch: string) => {
    if (!settings.workspaceId) throw new Error("Kein Repository ist mit dem Workspace-Service verbunden.");
    const client = await createConnectedClient();
    const result = await client.checkoutBranch(settings.workspaceId, branch);
    const nextSettings = { ...settings, branch: result.branch };
    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(nextSettings));
    setSettings(nextSettings);
    return result;
  }, [createConnectedClient, settings]);

  const syncRemoteChanges = useCallback(async (changes: RemoteWorkspaceChange[]) => {
    if (!settings.workspaceId) throw new Error("Kein Repository ist mit dem Workspace-Service verbunden.");
    const client = await createConnectedClient();
    for (const change of changes) {
      await client.writeFile(settings.workspaceId, change.path, change.content);
    }
    const { status } = await client.getGitStatus(settings.workspaceId);
    return { savedCount: changes.length, status };
  }, [createConnectedClient, settings.workspaceId]);

  const commitRepository = useCallback(async (message: string) => {
    if (!settings.workspaceId) throw new Error("Kein Repository ist mit dem Workspace-Service verbunden.");
    const client = await createConnectedClient();
    const result = await client.commit(settings.workspaceId, message.trim());
    return { hash: result.hash };
  }, [createConnectedClient, settings.workspaceId]);

  const pushRepository = useCallback(async () => {
    if (!settings.workspaceId) throw new Error("Kein Repository ist mit dem Workspace-Service verbunden.");
    const client = await createConnectedClient();
    const result = await client.push(settings.workspaceId);
    return { branch: result.branch };
  }, [createConnectedClient, settings.workspaceId]);

  const createRepositoryPullRequest = useCallback(async (input: { baseBranch: string; title: string; body: string }) => {
    if (!settings.workspaceId) throw new Error("Kein Repository ist mit dem Workspace-Service verbunden.");
    const client = await createConnectedClient();
    const result = await client.createPullRequest(settings.workspaceId, input);
    return { number: result.number, url: result.url, headBranch: result.headBranch, baseBranch: result.baseBranch };
  }, [createConnectedClient, settings.workspaceId]);

  const loadRepositoryQuality = useCallback(async () => {
    if (!settings.workspaceId) throw new Error("Kein Repository ist mit dem Workspace-Service verbunden.");
    const client = await createConnectedClient();
    return client.getRepositoryQuality(settings.workspaceId);
  }, [createConnectedClient, settings.workspaceId]);

  const loadWorkspaceHealth = useCallback(async () => {
    if (!settings.workspaceUrl) throw new Error("Hinterlege zuerst die HTTPS-URL des Workspace-Service.");
    const [serviceAccessToken, githubToken, providerApiKey] = await Promise.all([
      readSecureValue(SERVICE_ACCESS_TOKEN_KEY),
      readSecureValue(GITHUB_TOKEN_KEY),
      readSecureValue(PROVIDER_KEY_KEY),
    ]);
    const client = new RemoteWorkspaceClient({ baseUrl: settings.workspaceUrl, serviceAccessToken: serviceAccessToken || undefined, githubToken: githubToken || undefined, provider: settings.provider, providerApiKey: providerApiKey || undefined });
    return client.getHealth();
  }, [settings.provider, settings.workspaceUrl]);

  const requestDevelopmentProposal = useCallback(async (input: { prompt: string; activeFile?: string }) => {
    if (!settings.workspaceId) throw new Error("Verbinde zuerst ein Repository, bevor du einen Entwicklungsauftrag sendest.");
    const client = await createConnectedClient();
    return client.requestAgentProposal({ prompt: input.prompt.trim(), activeFile: input.activeFile });
  }, [createConnectedClient, settings.workspaceId]);

  const value = useMemo(
    () => ({ settings, loading, saveSettings, clearServiceAccessToken, clearGitHubToken, clearProviderKey, attachRepository, readAttachedFile, loadRepositoryDetails, switchRepositoryBranch, syncRemoteChanges, commitRepository, pushRepository, createRepositoryPullRequest, loadRepositoryQuality, loadWorkspaceHealth, requestDevelopmentProposal, setProtectedChatContent }),
    [attachRepository, clearGitHubToken, clearProviderKey, clearServiceAccessToken, commitRepository, createRepositoryPullRequest, loading, loadRepositoryDetails, loadRepositoryQuality, loadWorkspaceHealth, pushRepository, readAttachedFile, requestDevelopmentProposal, saveSettings, setProtectedChatContent, settings, switchRepositoryBranch, syncRemoteChanges],
  );

  return <StudioSettingsContext.Provider value={value}>{children}</StudioSettingsContext.Provider>;
}

export function useStudioSettings() {
  const context = useContext(StudioSettingsContext);
  if (!context) throw new Error("useStudioSettings must be used inside StudioSettingsProvider");
  return context;
}
