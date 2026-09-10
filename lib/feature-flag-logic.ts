/**
 * Sprint 61 — Feature-Flags: Features kontrolliert rollouten ohne Re-Deploy.
 *
 * Deterministisches Flag-System mit Registry (Defaults je Feature),
 * ENV-Overrides (FEATURE_FLAGS="chatSearch=off,chatExport=on") und
 * bewusst getrennter Server-/Client-Sicht: Der Client sieht nur
 * Einschaltzustande, niemals Begruendungen oder interne Details.
 */

export interface FeatureFlagDefinition {
  key: string;
  description: string;
  defaultEnabled: boolean;
}

export type FeatureFlagState = Record<string, boolean>;

/** Registry aller steuerbaren Features (Sprints 56-60 + kommende). */
export const FEATURE_FLAG_REGISTRY: FeatureFlagDefinition[] = [
  {
    key: "opsOverview",
    description: "Zentrale Betriebsuebersicht (Sprint 56)",
    defaultEnabled: true,
  },
  {
    key: "chatSessions",
    description: "Chat-Sessions mit parallelen Unterhaltungen (Sprint 57)",
    defaultEnabled: true,
  },
  {
    key: "chatExport",
    description: "Chat-Export als Markdown/JSON (Sprint 58)",
    defaultEnabled: true,
  },
  {
    key: "chatQuota",
    description: "Fair-Use-Tagesquote fuer den KI-Chat (Sprint 59)",
    defaultEnabled: true,
  },
  {
    key: "backupManifest",
    description: "DB-Backup-Manifest fuer Backups (Sprint 60)",
    defaultEnabled: true,
  },
];

/** Default-Zustand aus der Registry. */
export function defaultFeatureFlags(): FeatureFlagState {
  const state: FeatureFlagState = {};
  for (const flag of FEATURE_FLAG_REGISTRY) {
    state[flag.key] = flag.defaultEnabled;
  }
  return state;
}

/** Parst ENV-Overrides: "flagKey=on,otherFlag=off" — robust gegen Muell. */
export function parseFeatureFlagOverrides(raw: string): FeatureFlagState {
  const overrides: FeatureFlagState = {};
  const knownKeys = new Set(FEATURE_FLAG_REGISTRY.map((flag) => flag.key));
  for (const part of String(raw ?? "").split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().toLowerCase();
    if (!knownKeys.has(key)) continue;
    if (value === "on" || value === "true" || value === "1") {
      overrides[key] = true;
    } else if (value === "off" || value === "false" || value === "0") {
      overrides[key] = false;
    }
  }
  return overrides;
}

/** Verschmilzt Defaults mit ENV-Overrides (Overrides gewinnen). */
export function resolveFeatureFlags(
  overrides: FeatureFlagState,
): FeatureFlagState {
  const resolved = defaultFeatureFlags();
  for (const [key, enabled] of Object.entries(overrides)) {
    if (key in resolved) {
      resolved[key] = Boolean(enabled);
    }
  }
  return resolved;
}

/** Bequemlichkeit: Ist ein Feature aktiv? Unbekannte Keys gelten als aus. */
export function isFeatureEnabled(flags: FeatureFlagState, key: string): boolean {
  return Boolean(flags[key]);
}

/** Client-Sicht: nur Einschaltzustande, keine Beschreibungen. */
export function toClientFeatureFlags(flags: FeatureFlagState): FeatureFlagState {
  const client: FeatureFlagState = {};
  for (const flag of FEATURE_FLAG_REGISTRY) {
    client[flag.key] = isFeatureEnabled(flags, flag.key);
  }
  return client;
}

/** Humanlesbare Uebersicht fuer Logs (tokenfrei). */
export function describeFeatureFlags(flags: FeatureFlagState): string {
  return FEATURE_FLAG_REGISTRY.map((flag) => `${flag.key}=${flags[flag.key] ? "on" : "off"}`)
    .join(", ");
}
