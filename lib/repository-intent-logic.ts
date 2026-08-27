export const CYBERSARAH_REVENUE_REPOSITORY_URL = "https://github.com/niknight1403/cybersarah-revenue-os";
export const CYBERSARAH_REVENUE_REPOSITORY_NAME = "CyberSarah-revenue-os";
export const CYBERSARAH_REVENUE_DEFAULT_BRANCH = "main";

export type RepositoryChatIntent =
  | { type: "connect_repository"; repositoryUrl: string; branch: string; needsConfirmation: true }
  | { type: "analyze_repository" }
  | { type: "normal_prompt" };

const CONNECT_WORDS = /\b(verbinde|verbinden|anschließen|anbinden|connect|repository|repo|projekt)\b/i;
const ANALYZE_WORDS = /\b(analyse|analysiere|analysieren|prüfe|prüfen|architektur|review|untersuche)\b/i;

export function normalizeRepositoryUrl(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return CYBERSARAH_REVENUE_REPOSITORY_URL;
  const normalized = trimmed.replace(/\.git$/, "");
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length !== 2) return null;
    return `https://github.com/${segments[0]}/${segments[1]}`;
  } catch {
    return null;
  }
}

export function normalizeBranch(value?: string) {
  const branch = value?.trim() || CYBERSARAH_REVENUE_DEFAULT_BRANCH;
  return /^[A-Za-z0-9._/-]{1,120}$/.test(branch) && !branch.includes("..") ? branch : CYBERSARAH_REVENUE_DEFAULT_BRANCH;
}

export function parseRepositoryChatIntent(prompt: string): RepositoryChatIntent {
  const normalized = prompt.trim();
  const lower = normalized.toLowerCase();
  const referencesRevenueRepo = lower.includes("cybersarah-revenue-os") || lower.includes("cybersarah revenue os") || lower.includes("revenue-os");
  if (CONNECT_WORDS.test(normalized) && (referencesRevenueRepo || lower.includes("github.com/"))) {
    const urlMatch = normalized.match(/https:\/\/github\.com\/[^\s),.;]+/i)?.[0];
    const repositoryUrl = normalizeRepositoryUrl(urlMatch ?? CYBERSARAH_REVENUE_REPOSITORY_URL);
    return { type: "connect_repository", repositoryUrl: repositoryUrl ?? CYBERSARAH_REVENUE_REPOSITORY_URL, branch: normalizeBranch(normalized.match(/(?:branch|zweig)\s*[:=]?\s*([A-Za-z0-9._/-]+)/i)?.[1]), needsConfirmation: true };
  }
  if (ANALYZE_WORDS.test(normalized) && referencesRevenueRepo) return { type: "analyze_repository" };
  return { type: "normal_prompt" };
}
