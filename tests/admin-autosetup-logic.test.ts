import { describe, expect, it } from "vitest";
import { ADMIN_AUTOSETUP_VERSION, planAdminAutoSetup } from "../lib/admin-autosetup-logic";

describe("planAdminAutoSetup", () => {
  it("führt kein Setup für Nicht-Administratoren aus", () => {
    const plan = planAdminAutoSetup({ role: "user", storedSettings: null, hasProviderKey: false, connectorPreferences: null, skillPreferences: null, completedVersion: null });
    expect(plan.shouldRun).toBe(false);
    expect(plan.appliedSteps).toEqual([]);
    expect(plan.completedVersion).toBeNull();
  });

  it("initialisiert frisches Gerät vollständig für Administratoren", () => {
    const plan = planAdminAutoSetup({ role: "admin", storedSettings: null, hasProviderKey: false, connectorPreferences: null, skillPreferences: null, completedVersion: null });
    expect(plan.shouldRun).toBe(true);
    expect(plan.settings.provider).toBe("managed");
    expect(plan.settings.branch).toBe("main");
    expect(plan.settings.protectChatContent).toBe(true);
    expect(plan.connectorPreferences).toEqual({ workspace: true, github: true, provider: true });
    expect(plan.skillPreferences).toEqual({ agent: true, diff: true, quality: true });
    expect(plan.completedVersion).toBe(ADMIN_AUTOSETUP_VERSION);
    expect(plan.appliedSteps.length).toBeGreaterThan(0);
  });

  it("stellt den Provider auf managed, wenn kein Provider konfiguriert ist", () => {
    const plan = planAdminAutoSetup({ role: "admin", storedSettings: { workspaceUrl: "https://workspace", repositoryUrl: "https://github.com/x/y", branch: "dev", provider: "openai", localProviderEndpoints: { ollama: "http://localhost:11434" }, protectChatContent: false }, hasProviderKey: false, connectorPreferences: null, skillPreferences: null, completedVersion: null });
    expect(plan.settings.provider).toBe("managed");
    // Bestehende Nutzerauswahl bleibt erhalten:
    expect(plan.settings.repositoryUrl).toBe("https://github.com/x/y");
    expect(plan.settings.branch).toBe("dev");
    expect(plan.settings.protectChatContent).toBe(false);
    expect(plan.settings.localProviderEndpoints?.ollama).toBe("http://localhost:11434");
  });

  it("respektiert bereits abgeschlossene Setups (Idempotenz)", () => {
    const plan = planAdminAutoSetup({ role: "admin", storedSettings: { provider: "gemini" }, hasProviderKey: true, connectorPreferences: { workspace: true, github: true, provider: true }, skillPreferences: null, completedVersion: ADMIN_AUTOSETUP_VERSION });
    expect(plan.shouldRun).toBe(false);
    expect(plan.appliedSteps).toEqual([]);
    // Ohne Lauf wird die bestehende Konfiguration nicht angefasst:
    expect(plan.settings.provider).toBe("gemini");
  });

  it("führt ein Update aus, wenn die Setup-Version älter ist als der Standard", () => {
    const plan = planAdminAutoSetup({ role: "admin", storedSettings: { provider: "openai" }, hasProviderKey: false, connectorPreferences: null, skillPreferences: null, completedVersion: 0 });
    expect(plan.shouldRun).toBe(true);
    expect(plan.settings.provider).toBe("managed");
  });

  it("normalisiert kaputte Präferenzen statt sie zu übernehmen", () => {
    const plan = planAdminAutoSetup({ role: "admin", storedSettings: null, hasProviderKey: false, connectorPreferences: "kein-objekt", skillPreferences: { agent: "ja" }, completedVersion: null });
    expect(plan.connectorPreferences).toEqual({ workspace: true, github: true, provider: true });
    expect(plan.skillPreferences).toEqual({ agent: true, diff: true, quality: true });
  });

  it("lässt einen Provider mit hinterlegtem API-Key unberührt", () => {
    const plan = planAdminAutoSetup({ role: "admin", storedSettings: { provider: "openai", branch: "main", protectChatContent: true }, hasProviderKey: true, connectorPreferences: { workspace: true, github: true, provider: true }, skillPreferences: { agent: true, diff: true, quality: true }, completedVersion: null });
    expect(plan.shouldRun).toBe(true);
    expect(plan.settings.provider).toBe("openai");
    expect(plan.appliedSteps).toEqual(["Bestehende Konfiguration bestätigt — keine Änderungen nötig."]);
  });

  it("bestätigt eine bereits vollständige Konfiguration ohne sie zu verändern", () => {
    const plan = planAdminAutoSetup({ role: "admin", storedSettings: { workspaceUrl: "https://w", repositoryUrl: "https://r", branch: "main", provider: "managed", protectChatContent: true }, hasProviderKey: false, connectorPreferences: { workspace: true, github: true, provider: true }, skillPreferences: { agent: true, diff: true, quality: true }, completedVersion: null });
    expect(plan.shouldRun).toBe(true);
    expect(plan.appliedSteps).toEqual(["Bestehende Konfiguration bestätigt — keine Änderungen nötig."]);
    expect(plan.settings.provider).toBe("managed");
  });
});
