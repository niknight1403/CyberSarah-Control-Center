import { useEffect, useRef } from "react";

import { useStudioSettings } from "@/lib/studio-settings";

type AdminUser = { role?: string } | null | undefined;

/**
 * Sprint 71 — Autonome Router-Aktivierung fuer Administratoren.
 *
 * Sobald ein Administrator angemeldet ist, wird die manuelle Provider-Wahl
 * abgeschaltet und der autonome Auto-Router ("auto") als Standard-Profil
 * aktiviert. Idempotent: laeuft nur einmal pro App-Sitzung und nur, wenn
 * noch kein Auto-Router gesetzt ist. Normale Nutzer bleiben unberuehrt.
 */
export function useAdminAutoRouter(user: AdminUser) {
  const { settings, loading, saveSettings } = useStudioSettings();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (loading || attemptedRef.current) return;
    if (user?.role !== "admin") return;
    if (settings.provider === "auto") {
      attemptedRef.current = true;
      return;
    }
    attemptedRef.current = true;
    void (async () => {
      try {
        await saveSettings({
          workspaceUrl: settings.workspaceUrl,
          repositoryUrl: settings.repositoryUrl,
          branch: settings.branch,
          provider: "auto",
        });
      } catch {
        // Best-Effort: beim naechsten Mount wird erneut versucht.
        attemptedRef.current = false;
      }
    })();
  }, [loading, user, settings, saveSettings]);
}
