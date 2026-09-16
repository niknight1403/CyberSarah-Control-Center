/**
 * GitHub-API-Client (Transportschicht) — Sprint 132.
 *
 * Ein einziger, kleiner Zweck: mit dem bereits hinterlegten GitHub-Token
 * die eigenen Repositories auflisten, damit der Nutzer eines davon
 * auswaehlen kann, statt Repository-URL und Branch von Hand einzutippen.
 * Reine Parsing-/Sortier-Logik liegt in github-repository-picker-logic.ts.
 */

import { parseGithubRepositoryList, type GithubRepositorySummary } from "@/lib/github-repository-picker-logic";

const GITHUB_API_BASE = "https://api.github.com";

/**
 * Listet bis zu 100 Repositories des Token-Inhabers (eigene + Orgs), neueste
 * Aktivitaet zuerst. Wirft eine deutsche Fehlermeldung statt eines rohen
 * HTTP-Fehlers — die UI kann sie direkt anzeigen.
 */
export async function fetchGithubRepositories(token: string, signal?: AbortSignal): Promise<GithubRepositorySummary[]> {
  const trimmed = token.trim();
  if (trimmed.length === 0) throw new Error("Kein GitHub-Token hinterlegt.");

  const response = await fetch(`${GITHUB_API_BASE}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`, {
    headers: {
      Authorization: `Bearer ${trimmed}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal,
  });

  if (response.status === 401) throw new Error("GitHub-Token ist ungültig oder abgelaufen.");
  if (response.status === 403) throw new Error("GitHub hat die Anfrage abgelehnt (Rate-Limit oder fehlende Berechtigung).");
  if (!response.ok) throw new Error(`GitHub-API antwortete mit Status ${response.status}.`);

  const json = await response.json();
  return parseGithubRepositoryList(json);
}
