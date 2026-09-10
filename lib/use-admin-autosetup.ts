import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef } from "react";

import { useStudioSettings } from "@/lib/studio-settings";
import { CONNECTOR_PREFERENCE_STORAGE_KEY } from "@/lib/connector-preferences-logic";
import { SKILL_PREFERENCE_STORAGE_KEY } from "@/lib/skill-preferences-logic";
import { trpc } from "@/lib/trpc";
import { ADMIN_AUTOSETUP_VERSION, planAdminAutoSetup } from "@/lib/admin-autosetup-logic";

export const ADMIN_AUTOSETUP_STORAGE_KEY = "cybersarah.admin-autosetup.version";

type AdminAutoSetupUser = { role?: string } | null | undefined;

/**
 * Sprint 49 — Admin-Autosetup nach dem Login.
 *
 * Sobald ein Administrator angemeldet ist, wird das Control Center ohne jede
 * manuelle Konfiguration einsatzbereit gemacht: Provider auf On-Server-Modus
 * (sofern kein eigener Key vorliegt), Connector- und Skill-Präferenzen
 * initialisiert, Chat-Inhaltsschutz aktiviert. Der Lauf ist idempotent und
 * still — Fehler werden bewusst geschluckt, der Login bleibt immer erfolgreich.
 */
export function useAdminAutoSetup(user: AdminAutoSetupUser) {
  const { settings, saveSettings } = useStudioSettings();
  const utils = trpc.useUtils();
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const [completedRaw, connectorRaw, skillRaw] = await Promise.all([
        AsyncStorage.getItem(ADMIN_AUTOSETUP_STORAGE_KEY),
        AsyncStorage.getItem(CONNECTOR_PREFERENCE_STORAGE_KEY),
        AsyncStorage.getItem(SKILL_PREFERENCE_STORAGE_KEY),
      ]);
      const plan = planAdminAutoSetup({
        role: "admin",
        storedSettings: {
          workspaceUrl: settings.workspaceUrl,
          repositoryUrl: settings.repositoryUrl,
          branch: settings.branch,
          provider: settings.provider,
          localProviderEndpoints: settings.localProviderEndpoints,
          protectChatContent: settings.protectChatContent,
        },
        hasProviderKey: settings.hasProviderKey,
        connectorPreferences: connectorRaw ? JSON.parse(connectorRaw) : null,
        skillPreferences: skillRaw ? JSON.parse(skillRaw) : null,
        completedVersion: completedRaw != null && Number.isFinite(Number(completedRaw)) ? Number(completedRaw) : null,
      });
      if (!plan.shouldRun) return;
      // Sprint 69: Fehlende Workspace-URL vom Server beziehen (Zero-Config).
      let workspaceUrl = plan.settings.workspaceUrl;
      if (!workspaceUrl) {
        try {
          const remote = await utils.ops.workspaceServiceUrl.fetch();
          workspaceUrl = remote.url ?? "";
        } catch {
          workspaceUrl = "";
        }
      }
      await saveSettings({
        workspaceUrl,
        repositoryUrl: plan.settings.repositoryUrl,
        branch: plan.settings.branch,
        provider: plan.settings.provider,
        workspaceId: settings.workspaceId,
        protectChatContent: plan.settings.protectChatContent,
      });
      if (connectorRaw == null) await AsyncStorage.setItem(CONNECTOR_PREFERENCE_STORAGE_KEY, JSON.stringify(plan.connectorPreferences));
      if (skillRaw == null) await AsyncStorage.setItem(SKILL_PREFERENCE_STORAGE_KEY, JSON.stringify(plan.skillPreferences));
      await AsyncStorage.setItem(ADMIN_AUTOSETUP_STORAGE_KEY, String(ADMIN_AUTOSETUP_VERSION));
    } catch {
      // Autonomes Setup darf den Login niemals blockieren.
    } finally {
      running.current = false;
    }
  }, [saveSettings, settings, utils]);

  useEffect(() => {
    if (user?.role === "admin") void run();
  }, [run, user, user?.role]);
}
