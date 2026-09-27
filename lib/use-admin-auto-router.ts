import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";

import { useStudioSettings } from "@/lib/studio-settings";

type AdminUser = { role?: string } | null | undefined;

const AUTO_ROUTER_APPLIED_KEY = "custom-ai-studio.admin-auto-router-applied.v1";

/**
 * Sprint 71 — Autonome Router-Aktivierung fuer Administratoren.
 * Sprint 196 — Administrator-Vollzugriff: Der Auto-Router wird nur EINMAL
 * pro Geraet als Startprofil gesetzt (persistierter Marker). Danach greift
 * der Hook nie wieder ein — manuelle Provider-Wahlen des Administrators
 * (z. B. Groq oder OpenRouter in den App-Settings) bleiben dauerhaft
 * erhalten und werden nicht pro Sitzung auf 'auto' zurueckgesetzt.
 *
 * Idempotent und Best-Effort: Schreib-/Ladefehler stoppen nur diesen Versuch,
 * nie die App. Normale Nutzer bleiben unberuehrt.
 */
export function useAdminAutoRouter(user: AdminUser) {
  const { settings, loading, saveSettings } = useStudioSettings();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (loading || attemptedRef.current) return;
    if (user?.role !== "admin") return;
    attemptedRef.current = true;
    void (async () => {
      try {
        const alreadyApplied = await AsyncStorage.getItem(AUTO_ROUTER_APPLIED_KEY);
        if (alreadyApplied != null) return; // Startprofil gesetzt — Admin hat volle Kontrolle.
        await AsyncStorage.setItem(AUTO_ROUTER_APPLIED_KEY, new Date().toISOString());
        if (settings.provider === "auto") return;
        await saveSettings({
          workspaceUrl: settings.workspaceUrl,
          repositoryUrl: settings.repositoryUrl,
          branch: settings.branch,
          provider: "auto",
        });
      } catch {
        // Best-Effort: Marker/Profil konnte (noch) nicht gesetzt werden.
        attemptedRef.current = false;
      }
    })();
  }, [loading, user, settings, saveSettings]);
}
