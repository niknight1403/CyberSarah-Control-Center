import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONNECTOR_PREFERENCES,
  enabledConnectorCount,
  normalizeConnectorPreferences,
  CONNECTOR_PREFERENCE_STORAGE_KEY,
  toggleConnector,
} from "../lib/connector-preferences-logic";

describe("connector preference logic", () => {
  it("starts with all connectors enabled and a stable key", () => {
    expect(DEFAULT_CONNECTOR_PREFERENCES).toEqual({ workspace: true, github: true, provider: true });
    expect(CONNECTOR_PREFERENCE_STORAGE_KEY).toBe("cybersarah.connector-preferences.v1");
    expect(enabledConnectorCount(DEFAULT_CONNECTOR_PREFERENCES)).toBe(3);
  });

  it("toggles only the selected connector", () => {
    expect(toggleConnector(DEFAULT_CONNECTOR_PREFERENCES, "github")).toEqual({ workspace: true, github: false, provider: true });
  });

  it("normalizes malformed persisted values safely", () => {
    expect(normalizeConnectorPreferences({ workspace: false, github: "yes" })).toEqual({ workspace: false, github: true, provider: true });
    expect(normalizeConnectorPreferences(null)).toEqual(DEFAULT_CONNECTOR_PREFERENCES);
  });
});
