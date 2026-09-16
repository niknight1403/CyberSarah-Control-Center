/**
 * GitHub-Repository-Picker (rein, testbar) — Sprint 132.
 *
 * Macht aus der GitHub-REST-Antwort von GET /user/repos eine normalisierte,
 * sortierte Liste fuer die UI. Der Nutzer soll nach Hinterlegen des Tokens
 * NUR noch aus seinen eigenen Repos waehlen muessen (wie hier im Superagent-
 * Chat) — kein manuelles Abtippen von Repository-URL und Branch mehr.
 *
 * Side-effects (der eigentliche fetch gegen api.github.com) leben bewusst
 * getrennt in lib/github-api-client.ts — dieses Modul bleibt reiner
 * Parser/Reducer und ist ohne Netzwerk/Mocking vollstaendig testbar.
 */

export type GithubRepositorySummary = {
  id: number;
  fullName: string;
  htmlUrl: string;
  description: string;
  defaultBranch: string;
  isPrivate: boolean;
  isFork: boolean;
  updatedAt: string;
  stars: number;
};

/** Ein einzelnes GitHub-API-Repo-Objekt validieren und normalisieren. */
function parseOneRepository(raw: unknown): GithubRepositorySummary | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const id = data.id;
  const fullName = data.full_name;
  const htmlUrl = data.html_url;
  if (typeof id !== "number" || typeof fullName !== "string" || typeof htmlUrl !== "string") return null;
  return {
    id,
    fullName,
    htmlUrl,
    description: typeof data.description === "string" ? data.description : "",
    defaultBranch: typeof data.default_branch === "string" && data.default_branch.length > 0 ? data.default_branch : "main",
    isPrivate: data.private === true,
    isFork: data.fork === true,
    updatedAt: typeof data.updated_at === "string" ? data.updated_at : new Date(0).toISOString(),
    stars: typeof data.stargazers_count === "number" ? data.stargazers_count : 0,
  };
}

/**
 * Rohe API-Antwort (Array erwartet) in eine saubere Liste umwandeln,
 * neueste Aktivitaet zuerst. Ungueltige Eintraege werden stillschweigend
 * verworfen statt die ganze Liste zum Absturz zu bringen (z. B. wenn
 * GitHub bei einem Fehler ein Objekt statt eines Arrays liefert).
 */
export function parseGithubRepositoryList(raw: unknown): GithubRepositorySummary[] {
  if (!Array.isArray(raw)) return [];
  const parsed = raw.map(parseOneRepository).filter((repo): repo is GithubRepositorySummary => repo !== null);
  return parsed.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/** Case-insensitive Teilstring-Filter auf Name und Beschreibung. */
export function filterGithubRepositories(repos: readonly GithubRepositorySummary[], query: string): GithubRepositorySummary[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...repos];
  return repos.filter((repo) => repo.fullName.toLowerCase().includes(needle) || repo.description.toLowerCase().includes(needle));
}

/** Ein gewaehltes Repo in die Eingaben fuer attachRepository() uebersetzen. */
export function repositoryToConnectInput(repo: GithubRepositorySummary): { repositoryUrl: string; branch: string } {
  return { repositoryUrl: repo.htmlUrl.replace(/\.git$/i, ""), branch: repo.defaultBranch };
}

/** Relative "vor X" Anzeige fuer die letzte Aktivitaet (deutsch, grob gerundet). */
export function formatRelativeUpdatedAt(updatedAt: string, nowMs: number = Date.now()): string {
  const deltaMs = nowMs - new Date(updatedAt).getTime();
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return "gerade eben";
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `vor ${days} Tag${days === 1 ? "" : "en"}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `vor ${months} Monat${months === 1 ? "" : "en"}`;
  const years = Math.floor(months / 12);
  return `vor ${years} Jahr${years === 1 ? "" : "en"}`;
}
