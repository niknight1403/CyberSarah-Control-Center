import AsyncStorage from "@react-native-async-storage/async-storage";
import { type AgentProposal, type RemoteCommit, type RemoteHealth, type RepositoryQuality, RemoteWorkspaceClient } from "@/lib/remote-workspace-client";
import { defaultLocalProviderEndpoints, getDefaultFreeProvider, normalizeLocalProviderEndpoints, providerDefaults, toPersistedStudioSettings, type LocalProviderEndpoints, type ProviderId } from "@/lib/studio-settings-logic";
import { secureSessionStore } from "@/lib/secure-session-store";
import { providerKeyStorageKey, updateProviderKeyStatus, type ProviderKeyStatus } from "@/lib/provider-key-logic";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const PREFERENCES_KEY = "custom-ai-studio.preferences.v1";
const SERVICE_ACCESS_TOKEN_KEY = "custom-ai-studio.service-access-token.v1";
const GITHUB_TOKEN_KEY = "custom-ai-studio.github-token.v1";
const PROVIDER_KEY_KEY = "custom-ai-studio.provider-key.v1";

export const providerOptions = [
  { id: "managed", label: "On-Server", detail: "Der Workspace-Service verwaltet den Provider." },
  { id: "openai", label: "OpenAI", detail: `API-Key lokal geschützt · ${providerDefaults.openai.model} · kein garantierter Gratiszugang` },
  { id: "gemini", label: "Google Gemini", detail: `API-Key lokal geschützt oder per Server-Key · ${providerDefaults.gemini.model} · Free-Tier abhängig von Konto/Region` },
  { id: "openrouter", label: "OpenRouter", detail: `API-Key lokal geschützt · ${providerDefaults.openrouter.model} · Free-Modelle nur sofern verfügbar` },
  { id: "groq", label: "Groq", detail: `API-Key lokal geschützt · ${providerDefaults.groq.model}` },
  { id: "together", label: "Together AI", detail: "API-Key verbleibt verschlüsselt auf dem Gerät." },
  { id: "anthropic", label: "Anthropic", detail: "API-Key verbleibt verschlüsselt auf dem Gerät." },
  { id: "ollama", label: "Ollama lokal", detail: `Kein Cloud-Key · ${providerDefaults.ollama.model} · eigener Server erforderlich` },
  { id: "lmstudio", label: "LM Studio lokal", detail: `Kein Cloud-Key · ${providerDefaults.lmstudio.model} · eigener Server erforderlich` },
  { id: "custom", label: "Eigener OpenAI-kompatibler Endpoint", detail: `Eigener Endpoint · ${providerDefaults.custom.model} · URL im Workspace-Service konfigurieren` },
  { id: "huggingface", label: "Hugging Face", detail: `Token lokal geschützt · ${providerDefaults.huggingface.model} · begrenztes Free-Guthaben` },
] as const;

export type { ProviderId } from "@/lib/studio-settings-logic";

export type StudioSettings = {
  workspaceUrl: string;
  repositoryUrl: string;
  branch: string;
  provider: ProviderId;
  localProviderEndpoints: LocalProviderEndpoints;
  workspaceId?: string;
  hasServiceAccessToken: boolean;
  hasGitHubToken: boolean;
  hasProviderKey: boolean;
  providerKeyStatus: ProviderKeyStatus;
  protectChatContent: boolean;
};

export type StudioSettingsInput = Omit<StudioSettings, "hasServiceAccessToken" | "hasGitHubToken" | "hasProviderKey" | "providerKeyStatus" | "localProviderEndpoints" | "protectChatContent"> & {
  serviceAccessToken?: string;
  githubToken?: string;
  providerApiKey?: string;
  localProviderEndpoints?: Partial<LocalProviderEndpoints>;
  protectChatContent?: boolean;
};
export type RemoteWorkspaceChange = { path: string; content: string };

const defaultSettings: StudioSettings = {
  workspaceUrl: "",
  repositoryUrl: "",
  branch: "main",
  provider: getDefaultFreeProvider(),
  localProviderEndpoints: defaultLocalProviderEndpoints,
  hasServiceAccessToken: false,
  hasGitHubToken: false,
  hasProviderKey: false,
  providerKeyStatus: {},
  protectChatContent: false,
};

async function writeSecureValue(key: string, value: string) {
  await secureSessionStore.set(key, value);
}

async function deleteSecureValue(key: string) {
  await secureSessionStore.remove(key);
}

async function hasSecureValue(key: string) {
  return secureSessionStore.has(key);
}

async function readSecureValue(key: string) {
  return secureSessionStore.get(key);
}

async function readProviderApiKey(provider: ProviderId) {
  return (await readSecureValue(providerKeyStorageKey(provider))) || (await readSecureValue(PROVIDER_KEY_KEY));
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
  testLocalProviderEndpoint: (provider: "ollama" | "lmstudio", endpoint: string) => Promise<{ provider: "ollama" | "lmstudio"; status: "ready"; modelCount: number }>;
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
        const providerKeyEntries = await Promise.all(providerOptions.filter((option) => option.id !== "managed").map(async (option) => [option.id, await hasSecureValue(providerKeyStorageKey(option.id))] as const));
        const providerKeyStatus = Object.fromEntries(providerKeyEntries) as ProviderKeyStatus;
        if (hasProviderKey && parsed.provider && parsed.provider !== "managed") providerKeyStatus[parsed.provider] = true;
        setSettings({ ...defaultSettings, ...parsed, localProviderEndpoints: normalizeLocalProviderEndpoints(parsed.localProviderEndpoints), hasServiceAccessToken, hasGitHubToken, hasProviderKey: Boolean(providerKeyStatus[parsed.provider ?? defaultSettings.provider]), providerKeyStatus });
      } finally {
        setLoading(false);
      }
    };
    void loadSettings();
  }, []);

  const saveSettings = useCallback(async (input: StudioSettingsInput) => {
    const nextSettings: StudioSettings = {
      ...toPersistedStudioSettings({ ...input, localProviderEndpoints: input.localProviderEndpoints ?? settings.localProviderEndpoints, protectChatContent: input.protectChatContent ?? settings.protectChatContent }),
      localProviderEndpoints: normalizeLocalProviderEndpoints(input.localProviderEndpoints ?? settings.localProviderEndpoints),
      workspaceId: settings.workspaceId,
      hasServiceAccessToken: input.serviceAccessToken?.trim() ? true : settings.hasServiceAccessToken,
      hasGitHubToken: input.githubToken?.trim() ? true : settings.hasGitHubToken,
      hasProviderKey: Boolean((input.providerApiKey?.trim() ? updateProviderKeyStatus(settings.providerKeyStatus, input.provider, true) : settings.providerKeyStatus)[input.provider]),
      providerKeyStatus: input.providerApiKey?.trim() ? updateProviderKeyStatus(settings.providerKeyStatus, input.provider, true) : settings.providerKeyStatus,
    };

    if (input.serviceAccessToken?.trim()) await writeSecureValue(SERVICE_ACCESS_TOKEN_KEY, input.serviceAccessToken.trim());
    if (input.githubToken?.trim()) await writeSecureValue(GITHUB_TOKEN_KEY, input.githubToken.trim());
    if (input.providerApiKey?.trim()) await writeSecureValue(providerKeyStorageKey(input.provider), input.providerApiKey.trim());

    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(nextSettings));
    setSettings(nextSettings);
    return nextSettings;
  }, [settings.hasGitHubToken, settings.hasProviderKey, settings.hasServiceAccessToken, settings.localProviderEndpoints, settings.protectChatContent, settings.providerKeyStatus, settings.workspaceId]);

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
    await deleteSecureValue(providerKeyStorageKey(settings.provider));
    await deleteSecureValue(PROVIDER_KEY_KEY);
    setSettings((current) => ({ ...current, hasProviderKey: false, providerKeyStatus: updateProviderKeyStatus(current.providerKeyStatus, current.provider, false) }));
  }, [settings.provider]);

  const attachRepository = useCallback(async (input: StudioSettingsInput) => {
    const storedSettings = await saveSettings(input);
    const [storedServiceToken, storedGitHubToken, storedProviderKey] = await Promise.all([
      readSecureValue(SERVICE_ACCESS_TOKEN_KEY),
      readSecureValue(GITHUB_TOKEN_KEY),
      readProviderApiKey(storedSettings.provider),
    ]);
    const client = new RemoteWorkspaceClient({
      baseUrl: storedSettings.workspaceUrl,
      serviceAccessToken: input.serviceAccessToken?.trim() || storedServiceToken || undefined,
      githubToken: input.githubToken?.trim() || storedGitHubToken || undefined,
      provider: storedSettings.provider,
      providerApiKey: input.providerApiKey?.trim() || storedProviderKey || undefined,
      localProviderEndpoints: storedSettings.localProviderEndpoints,
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
      readProviderApiKey(settings.provider),
    ]);
    const client = new RemoteWorkspaceClient({
      baseUrl: settings.workspaceUrl,
      serviceAccessToken: serviceAccessToken || undefined,
      githubToken: githubToken || undefined,
      provider: settings.provider,
      providerApiKey: providerApiKey || undefined,
      localProviderEndpoints: settings.localProviderEndpoints,
    });
    return client.getFile(settings.workspaceId, path);
  }, [settings.localProviderEndpoints, settings.provider, settings.workspaceId, settings.workspaceUrl]);

  const createConnectedClient = useCallback(async () => {
    if (!settings.workspaceUrl || !settings.workspaceId) throw new Error("Kein Repository ist mit dem Workspace-Service verbunden.");
    const [serviceAccessToken, githubToken, providerApiKey] = await Promise.all([
      readSecureValue(SERVICE_ACCESS_TOKEN_KEY),
      readSecureValue(GITHUB_TOKEN_KEY),
      readProviderApiKey(settings.provider),
    ]);
    return new RemoteWorkspaceClient({
      baseUrl: settings.workspaceUrl,
      serviceAccessToken: serviceAccessToken || undefined,
      githubToken: githubToken || undefined,
      provider: settings.provider,
      providerApiKey: providerApiKey || undefined,
      localProviderEndpoints: settings.localProviderEndpoints,
    });
  }, [settings.localProviderEndpoints, settings.provider, settings.workspaceId, settings.workspaceUrl]);

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
      readProviderApiKey(settings.provider),
    ]);
    const client = new RemoteWorkspaceClient({ baseUrl: settings.workspaceUrl, serviceAccessToken: serviceAccessToken || undefined, githubToken: githubToken || undefined, provider: settings.provider, providerApiKey: providerApiKey || undefined, localProviderEndpoints: settings.localProviderEndpoints });
    return client.getHealth();
  }, [settings.localProviderEndpoints, settings.provider, settings.workspaceUrl]);

  const testLocalProviderEndpoint = useCallback(async (provider: "ollama" | "lmstudio", endpoint: string) => {
    if (!settings.workspaceUrl) throw new Error("Hinterlege zuerst die HTTPS-URL des Workspace-Service.");
    const [serviceAccessToken, providerApiKey] = await Promise.all([readSecureValue(SERVICE_ACCESS_TOKEN_KEY), readProviderApiKey(provider)]);
    const client = new RemoteWorkspaceClient({
      baseUrl: settings.workspaceUrl,
      serviceAccessToken: serviceAccessToken || undefined,
      provider,
      providerApiKey: providerApiKey || undefined,
      localProviderEndpoints: { [provider]: endpoint },
    });
    return client.testLocalProviderEndpoint(provider);
  }, [settings.workspaceUrl]);

  const requestDevelopmentProposal = useCallback(async (input: { prompt: string; activeFile?: string }) => {
    if (!settings.workspaceId) throw new Error("Verbinde zuerst ein Repository, bevor du einen Entwicklungsauftrag sendest.");
    const client = await createConnectedClient();
    return client.requestAgentProposal({ prompt: input.prompt.trim(), activeFile: input.activeFile });
  }, [createConnectedClient, settings.workspaceId]);

  const value = useMemo(
    () => ({ settings, loading, saveSettings, clearServiceAccessToken, clearGitHubToken, clearProviderKey, attachRepository, readAttachedFile, loadRepositoryDetails, switchRepositoryBranch, syncRemoteChanges, commitRepository, pushRepository, createRepositoryPullRequest, loadRepositoryQuality, loadWorkspaceHealth, testLocalProviderEndpoint, requestDevelopmentProposal, setProtectedChatContent }),
    [attachRepository, clearGitHubToken, clearProviderKey, clearServiceAccessToken, commitRepository, createRepositoryPullRequest, loading, loadRepositoryDetails, loadRepositoryQuality, loadWorkspaceHealth, pushRepository, readAttachedFile, requestDevelopmentProposal, saveSettings, setProtectedChatContent, settings, switchRepositoryBranch, syncRemoteChanges, testLocalProviderEndpoint],
  );

  return <StudioSettingsContext.Provider value={value}>{children}</StudioSettingsContext.Provider>;
}

export function useStudioSettings() {
  const context = useContext(StudioSettingsContext);
  if (!context) throw new Error("useStudioSettings must be used inside StudioSettingsProvider");
  return context;
}
