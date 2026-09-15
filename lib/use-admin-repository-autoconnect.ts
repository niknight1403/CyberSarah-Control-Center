import { useEffect, useRef } from "react";

import { CYBERSARAH_REVENUE_DEFAULT_BRANCH, CYBERSARAH_REVENUE_REPOSITORY_URL } from "@/lib/repository-intent-logic";
import { useStudioSettings } from "@/lib/studio-settings";

type AdminUser = { role?: string } | null | undefined;

/**
 * Sprint 127 — Autonome Repository-Verbindung fuer Administratoren.
 *
 * Bisher musste der Administrator die RepositoryConnectCard im Chat-Tab
 * manuell ausfuellen (URL + Branch + Bestaetigen), obwohl GitHub-Token und
 * Workspace-Service-URL bereits serverseitig/als Default vorliegen. Sobald
 * useAdminGithubTokenSync das Token synchronisiert hat, verbindet dieser
 * Hook automatisch das Standard-Repository (CyberSarah-revenue-os, main) —
 * kein manueller Klick mehr noetig. Idempotent pro Sitzung: bei Fehlschlag
 * (Workspace-Service kurzzeitig nicht erreichbar) wird beim naechsten Mount
 * erneut versucht. Ein bereits verbundenes Repository (settings.workspaceId)
 * wird nie ueberschrieben. Normale Nutzer bleiben unberuehrt.
 */
export function useAdminRepositoryAutoConnect(user: AdminUser) {
  const { settings, loading, attachRepository } = useStudioSettings();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (loading || attemptedRef.current) return;
    if (user?.role !== "admin") return;
    if (settings.workspaceId) {
      attemptedRef.current = true;
      return;
    }
    // Warten, bis useAdminGithubTokenSync das Token bereitgestellt hat —
    // ohne Token wuerde die Verbindung nur mit oeffentlichem Lesezugriff
    // (oder gar nicht) funktionieren.
    if (!settings.hasGitHubToken) return;

    attemptedRef.current = true;
    void attachRepository({
      workspaceUrl: settings.workspaceUrl,
      repositoryUrl: settings.repositoryUrl || CYBERSARAH_REVENUE_REPOSITORY_URL,
      branch: settings.branch || CYBERSARAH_REVENUE_DEFAULT_BRANCH,
      provider: settings.provider,
      localProviderEndpoints: settings.localProviderEndpoints,
      protectChatContent: settings.protectChatContent,
    }).catch(() => {
      // Best-Effort: naechster Mount versucht es erneut (z. B. Workspace-
      // Service war kurzzeitig nicht erreichbar).
      attemptedRef.current = false;
    });
  }, [loading, user, settings, attachRepository]);
}
