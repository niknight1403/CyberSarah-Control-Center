import type { ProviderId } from "@/lib/studio-settings";

export type RemoteWorkspaceConfig = {
  baseUrl: string;
  serviceAccessToken?: string;
  githubToken?: string;
  provider?: ProviderId;
  providerApiKey?: string;
};

export type RemoteHealth = {
  status: "ready" | "busy";
  version: string;
  previewUrl?: string;
};

export type RepositoryRequest = {
  repositoryUrl: string;
  branch: string;
};

export type AgentRequest = {
  prompt: string;
  activeFile?: string;
};

export type AgentProposal = {
  summary: string;
  patch: string;
  affectedFiles: string[];
};

export function buildWorkspaceHeaders(config: RemoteWorkspaceConfig) {
  return {
    "Content-Type": "application/json",
    ...(config.serviceAccessToken ? { Authorization: `Bearer ${config.serviceAccessToken}` } : {}),
    ...(config.githubToken ? { "X-GitHub-Token": config.githubToken } : {}),
    ...(config.provider ? { "X-AI-Provider": config.provider } : {}),
    ...(config.providerApiKey ? { "X-AI-Provider-Key": config.providerApiKey } : {}),
  };
}

/**
 * Client-side contract for the user's self-hosted workspace service.
 * The service, not the mobile app, performs process execution and filesystem actions.
 */
export class RemoteWorkspaceClient {
  constructor(private readonly config: RemoteWorkspaceConfig) {}

  private get requestHeaders() {
    return buildWorkspaceHeaders(this.config);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: { ...this.requestHeaders, ...init?.headers },
    });
    if (!response.ok) throw new Error(`Workspace-Service antwortet mit ${response.status}.`);
    return (await response.json()) as T;
  }

  getHealth() {
    return this.request<RemoteHealth>("/api/v1/health");
  }

  attachRepository(input: RepositoryRequest) {
    return this.request<{ workspaceId: string; branch: string }>("/api/v1/repositories/attach", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listFiles(workspaceId: string) {
    return this.request<{ files: string[] }>(`/api/v1/workspaces/${workspaceId}/files`);
  }

  getFile(workspaceId: string, path: string) {
    return this.request<{ path: string; content: string }>(`/api/v1/workspaces/${workspaceId}/file?path=${encodeURIComponent(path)}`);
  }

  requestAgentProposal(input: AgentRequest) {
    return this.request<AgentProposal>("/api/v1/agent/proposals", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
