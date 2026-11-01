import { execSync } from "node:child_process";

export interface DeploymentInfo {
  gitCommitSha: string | null;
  gitCommitShaReason: string | null;
  deployedAt: string | null;
}

const SERVER_START_TIME = new Date().toISOString();

/**
 * Ermittelt die deployed Commit-SHA sowie die Deploy-Zeitpunkt-Informationen.
 * 
 * Bevorzugte Quellen fuer gitCommitSha (in Reihenfolge):
 * 1. Environment-Variablen (GIT_COMMIT_SHA, COMMIT_SHA, RENDER_GIT_COMMIT, VERCEL_GIT_COMMIT_SHA, GITHUB_SHA, BUILD_SHA, HEROKU_SLUG_COMMIT)
 * 2. Git CLI Aufruf (`git rev-parse HEAD`), falls im Arbeitsverzeichnis ausfuehrbar.
 * 3. Falls keine Quelle verfuegbar ist, wird ehrlich null + ehrlicher Grund geliefert.
 */
export function resolveDeploymentInfo(
  customEnv?: Record<string, string | undefined>,
  customGitResolver?: () => string
): DeploymentInfo {
  const env = customEnv || process.env;

  const envSha =
    env.GIT_COMMIT_SHA ||
    env.COMMIT_SHA ||
    env.RENDER_GIT_COMMIT ||
    env.VERCEL_GIT_COMMIT_SHA ||
    env.GITHUB_SHA ||
    env.BUILD_SHA ||
    env.HEROKU_SLUG_COMMIT;

  let sha: string | null = null;
  let reason: string | null = null;

  if (envSha && envSha.trim().length > 0) {
    sha = envSha.trim();
  } else {
    try {
      if (customGitResolver) {
        sha = customGitResolver().trim();
      } else {
        const stdout = execSync("git rev-parse HEAD", {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 2000,
        });
        sha = stdout.trim();
      }
      if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) {
        sha = null;
        reason = "Git-Befehl lieferte keine gueltige Commit-SHA.";
      }
    } catch {
      sha = null;
      reason = "Keine Commit-SHA via Environment-Variablen oder Git-Repository verfuegbar.";
    }
  }

  const deployedAt =
    env.DEPLOYED_AT ||
    env.BUILD_TIMESTAMP ||
    env.BUILD_TIME ||
    SERVER_START_TIME;

  return {
    gitCommitSha: sha,
    gitCommitShaReason: sha ? null : (reason || "Keine Commit-SHA Quelle verfuegbar."),
    deployedAt: deployedAt || null,
  };
}
