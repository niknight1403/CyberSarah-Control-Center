export type ProviderId = "managed" | "openai" | "groq" | "together" | "anthropic";

export type PersistedStudioSettings = {
  workspaceUrl: string;
  repositoryUrl: string;
  branch: string;
  provider: ProviderId;
};

export function normalizeWorkspaceUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

export function toPersistedStudioSettings(input: PersistedStudioSettings): PersistedStudioSettings {
  return {
    workspaceUrl: normalizeWorkspaceUrl(input.workspaceUrl),
    repositoryUrl: input.repositoryUrl.trim(),
    branch: input.branch.trim() || "main",
    provider: input.provider,
  };
}

export function getRepositoryLabel(repositoryUrl: string) {
  const withoutSuffix = repositoryUrl.trim().replace(/\/$/, "").replace(/\.git$/, "");
  return withoutSuffix.split("/").filter(Boolean).slice(-2).join("/") || "Lokaler Arbeitsbereich";
}
