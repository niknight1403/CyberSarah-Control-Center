/**
 * Admin-Integrationen (rein, testbar) — Sprint 87.
 *
 * Fuer den Administrator (Rolle "admin", server-seitig geprueft) sollen
 * server-seitig hinterlegte Secrets automatisch verfuegbar sein, ohne dass
 * ein manueller Copy/Paste-Schritt in der App noetig ist. Dieses Modul
 * entscheidet rein und deterministisch, OB ein serverseitig hinterlegtes
 * GitHub-Token an den (bereits authentifizierten) Administrator ausgeliefert
 * werden darf. Die Autoritaet ("ist admin?") bleibt beim Server/JWT — hier
 * wird nur die reine Entscheidung getroffen.
 */

import { isPlausibleGithubToken } from "./github-integration-logic";

export type AdminGithubTokenEnv = {
  ADMIN_GITHUB_TOKEN?: string | null;
  GITHUB_TOKEN?: string | null;
};

export type AdminGithubTokenResult =
  | { available: true; token: string }
  | { available: false; reason: "not-admin" | "not-configured" | "invalid-format" };

/**
 * Liefert das serverseitig hinterlegte Admin-GitHub-Token nur, wenn der
 * Aufrufer Administrator ist UND ein plausibel formatiertes Token
 * konfiguriert wurde (ADMIN_GITHUB_TOKEN hat Vorrang vor GITHUB_TOKEN).
 * Niemals ein Token an Nicht-Admins zurueckgeben — das ist die einzige
 * Sicherheitsgrenze, die dieses reine Modul durchsetzt.
 */
export function resolveAdminGithubToken(
  env: AdminGithubTokenEnv,
  isAdmin: boolean,
): AdminGithubTokenResult {
  if (!isAdmin) return { available: false, reason: "not-admin" };

  const candidate = (env.ADMIN_GITHUB_TOKEN?.trim() || env.GITHUB_TOKEN?.trim() || "").trim();
  if (!candidate) return { available: false, reason: "not-configured" };
  if (!isPlausibleGithubToken(candidate)) return { available: false, reason: "invalid-format" };

  return { available: true, token: candidate };
}
