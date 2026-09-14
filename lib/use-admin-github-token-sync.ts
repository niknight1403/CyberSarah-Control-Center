import { useEffect, useRef } from "react";

import { trpc } from "@/lib/trpc";
import { useStudioSettings } from "@/lib/studio-settings";

type AdminUser = { role?: string } | null | undefined;

/**
 * Sprint 87 — Autonome GitHub-Token-Provisionierung fuer Administratoren.
 *
 * Sobald ein Administrator angemeldet ist und noch kein GitHub-Token in
 * diesem Geraet gespeichert ist, holt dieser Hook das serverseitig
 * hinterlegte Token (ADMIN_GITHUB_TOKEN/GITHUB_TOKEN, admin-only tRPC-Query)
 * und speichert es einmalig in den lokalen Settings — kein manuelles
 * Copy/Paste mehr noetig. Idempotent pro Sitzung, wie useAdminAutoRouter.
 * Normale Nutzer bleiben unberuehrt (Query laeuft nur fuer role === "admin").
 */
export function useAdminGithubTokenSync(user: AdminUser) {
  const { settings, loading, saveSettings } = useStudioSettings();
  const attemptedRef = useRef(false);
  const isAdmin = user?.role === "admin";

  const tokenQuery = trpc.admin.githubToken.useQuery(undefined, {
    enabled: isAdmin && !loading && !settings.hasGitHubToken,
    retry: false,
  });

  useEffect(() => {
    if (!isAdmin || loading || attemptedRef.current) return;
    if (settings.hasGitHubToken) {
      attemptedRef.current = true;
      return;
    }
    const token = tokenQuery.data?.token;
    if (!token) return;

    attemptedRef.current = true;
    void (async () => {
      try {
        await saveSettings({
          workspaceUrl: settings.workspaceUrl,
          repositoryUrl: settings.repositoryUrl,
          branch: settings.branch,
          provider: settings.provider,
          githubToken: token,
        });
      } catch {
        // Best-Effort: beim naechsten Mount wird erneut versucht.
        attemptedRef.current = false;
      }
    })();
  }, [isAdmin, loading, settings, saveSettings, tokenQuery.data]);
}
