import { toPersistedStudioSettings, type PersistedStudioSettings } from "./studio-settings-logic";
import { CYBERSARAH_REVENUE_DEFAULT_BRANCH, CYBERSARAH_REVENUE_REPOSITORY_URL } from "./repository-intent-logic";
import { DEFAULT_CONNECTOR_PREFERENCES, normalizeConnectorPreferences, type ConnectorPreferences } from "./connector-preferences-logic";
import { DEFAULT_SKILL_PREFERENCES, normalizeSkillPreferences, type SkillPreferences } from "./skill-preferences-logic";

/**
 * Sprint 49 — Admin-Autosetup-Planung.
 *
 * Ziel: Nach dem Administrator-Login ist das Control Center ohne jede manuelle
 * Konfiguration einsatzbereit. Die Planung ist vollständig deterministisch und
 * ohne Nebenwirkungen; alle Speicher-Vorgänge führt der Aufrufer aus.
 */

export const ADMIN_AUTOSETUP_VERSION = 2;

export type AdminAutoSetupSnapshot = {
  role: string;
  storedSettings: Partial<PersistedStudioSettings> | null;
  /** Ob für den gespeicherten Provider ein API-Key hinterlegt ist (SecureStore). */
  hasProviderKey: boolean;
  connectorPreferences: unknown;
  skillPreferences: unknown;
  completedVersion: number | null;
};

export type AdminAutoSetupPlan = {
  shouldRun: boolean;
  settings: PersistedStudioSettings;
  connectorPreferences: ConnectorPreferences;
  skillPreferences: SkillPreferences;
  appliedSteps: string[];
  completedVersion: number | null;
};

const ADMIN_ROLE = "admin";

/**
 * Leitet aus dem Snapshot ab, welche Einstellungen für den Administrator
 * gelten müssen, damit der Chat ohne manuelle Konfiguration funktioniert.
 *
 * Kernentscheidung: Der Provider wird auf "managed" (On-Server-KI) gesetzt,
 * wenn kein eigener Provider mit hinterlegtem Schlüssel existiert — damit ist
 * readyForChat ohne Nutzereingabe erfüllt. Bestehende Nutzerauswahl
 * (Provider, Repository, Branch) bleibt unangetastet.
 */
export function planAdminAutoSetup(snapshot: AdminAutoSetupSnapshot): AdminAutoSetupPlan {
  const stored = snapshot.storedSettings ?? {};
  const current = toPersistedStudioSettings({
    workspaceUrl: stored.workspaceUrl ?? "",
    // Sprint 69 (v2): Standard-Repository CyberSarah-revenue-os/main, damit
    // nach dem App-Start keine manuelle Verknuepfung mehr noetig ist.
    repositoryUrl: stored.repositoryUrl?.trim() || CYBERSARAH_REVENUE_REPOSITORY_URL,
    branch: stored.branch?.trim() || CYBERSARAH_REVENUE_DEFAULT_BRANCH,
    provider: stored.provider ?? "managed",
    localProviderEndpoints: stored.localProviderEndpoints,
    protectChatContent: stored.protectChatContent ?? true,
  });

  const connectorPreferences = snapshot.connectorPreferences == null
    ? { ...DEFAULT_CONNECTOR_PREFERENCES }
    : normalizeConnectorPreferences(snapshot.connectorPreferences);
  const skillPreferences = snapshot.skillPreferences == null
    ? { ...DEFAULT_SKILL_PREFERENCES }
    : normalizeSkillPreferences(snapshot.skillPreferences);

  const isCompleted = snapshot.completedVersion != null && snapshot.completedVersion >= ADMIN_AUTOSETUP_VERSION;
  const shouldRun = snapshot.role === ADMIN_ROLE && !isCompleted;

  if (!shouldRun) {
    return {
      shouldRun: false,
      settings: current,
      connectorPreferences,
      skillPreferences,
      appliedSteps: [],
      completedVersion: snapshot.completedVersion,
    };
  }

  const appliedSteps: string[] = [];
  let settings = current;

  if (!stored.provider || (stored.provider !== "managed" && !snapshot.hasProviderKey)) {
    settings = { ...settings, provider: "managed" };
    appliedSteps.push("KI-Provider auf On-Server-Modus gestellt (managed) — Chat ohne eigenen API-Key nutzbar.");
  }
  if (!stored.repositoryUrl?.trim()) {
    appliedSteps.push(`Standard-Repository ${CYBERSARAH_REVENUE_REPOSITORY_URL} (Branch ${CYBERSARAH_REVENUE_DEFAULT_BRANCH}) hinterlegt.`);
  }
  if (stored.protectChatContent == null) {
    appliedSteps.push("Chat-Inhaltsschutz standardmäßig aktiviert.");
  }
  if (snapshot.connectorPreferences == null) {
    appliedSteps.push("Connector-Präferenzen initialisiert (Workspace, GitHub, Provider aktiv).");
  }
  if (snapshot.skillPreferences == null) {
    appliedSteps.push("Skill-Präferenzen initialisiert (Agent, Diff, Qualität aktiv).");
  }
  if (!appliedSteps.length) {
    appliedSteps.push("Bestehende Konfiguration bestätigt — keine Änderungen nötig.");
  }

  return {
    shouldRun: true,
    settings,
    connectorPreferences,
    skillPreferences,
    appliedSteps,
    completedVersion: ADMIN_AUTOSETUP_VERSION,
  };
}
