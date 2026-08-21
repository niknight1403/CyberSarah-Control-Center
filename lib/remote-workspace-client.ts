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
  rationale: string;
  changes: Array<{ path: string; content: string; explanation: string }>;
  affectedFiles: string[];
};
export type RemoteCommit = {
  hash: string;
  shortHash: string;
  author: string;
  committedAt: string;
  message: string;
};
export type RemoteBranches = { currentBranch: string; branches: string[] };
export type RepositoryQuality = {
  branch: string;
  pullRequest: { number: number; title: string; url: string; headBranch: string; baseBranch: string } | null;
  merge: { state: string; label: string };
  ci: {
    state: string;
    label: string;
    total: number;
    passed: number;
    failed: number;
    pending: number;
    checks: Array<{ name: string; status: string; conclusion: string | null; url: string | null }>;
  };
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
  writeFile(workspaceId: string, path: string, content: string) {
    return this.request<{ saved: boolean; path: string }>(`/api/v1/workspaces/${workspaceId}/file`, {
      method: "PUT",
      body: JSON.stringify({ path, content }),
    });
  }
  getGitStatus(workspaceId: string) {
    return this.request<{ status: string }>(`/api/v1/workspaces/${workspaceId}/git/status`);
  }
  listBranches(workspaceId: string) {
    return this.request<RemoteBranches>(`/api/v1/workspaces/${workspaceId}/git/branches`);
  }
  checkoutBranch(workspaceId: string, branch: string) {
    return this.request<{ branch: string; files: string[] }>(`/api/v1/workspaces/${workspaceId}/git/checkout`, {
      method: "POST",
      body: JSON.stringify({ branch }),
    });
  }
  listCommits(workspaceId: string, limit = 10) {
    return this.request<{ commits: RemoteCommit[] }>(`/api/v1/workspaces/${workspaceId}/git/commits?limit=${limit}`);
  }
  commit(workspaceId: string, message: string) {
    return this.request<{ committed: boolean; hash: string; output: string }>(`/api/v1/workspaces/${workspaceId}/git/commit`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  }
  push(workspaceId: string) {
    return this.request<{ pushed: boolean; branch: string; output: string }>(`/api/v1/workspaces/${workspaceId}/git/push`, { method: "POST" });
  }
  createPullRequest(workspaceId: string, input: { baseBranch: string; title: string; body: string }) {
    return this.request<{ number: number; url: string; state: string; title: string; headBranch: string; baseBranch: string }>(`/api/v1/workspaces/${workspaceId}/git/pull-request`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  getRepositoryQuality(workspaceId: string) {
    return this.request<RepositoryQuality>(`/api/v1/workspaces/${workspaceId}/git/quality`);
  }

  requestAgentProposal(input: AgentRequest) {
    return this.request<AgentProposal>("/api/v1/agent/proposals", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
