export type ConnectorId = "workspace" | "github" | "provider";
export type ConnectorPreferences = Record<ConnectorId, boolean>;

export const CONNECTOR_PREFERENCE_STORAGE_KEY = "cybersarah.connector-preferences.v1";
export const DEFAULT_CONNECTOR_PREFERENCES: ConnectorPreferences = { workspace: true, github: true, provider: true };

export function normalizeConnectorPreferences(value: unknown): ConnectorPreferences {
  if (!value || typeof value !== "object") return { ...DEFAULT_CONNECTOR_PREFERENCES };
  const input = value as Partial<Record<ConnectorId, unknown>>;
  return {
    workspace: input.workspace !== false,
    github: input.github !== false,
    provider: input.provider !== false,
  };
}

export function toggleConnector(preferences: ConnectorPreferences, connector: ConnectorId): ConnectorPreferences {
  return { ...preferences, [connector]: !preferences[connector] };
}

export function enabledConnectorCount(preferences: ConnectorPreferences): number {
  return Object.values(preferences).filter(Boolean).length;
}
