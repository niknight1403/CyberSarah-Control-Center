/**
 * Sprint 156 — Tests fuer das Neon-Pulse-Dashboard-View-Model.
 * Kernforderungen aus dem Implementierungsauftrag:
 *  - keine erfundenen Live-Daten (Uptime, Aktivitaet)
 *  - Administrator-Badge nur bei serverseitig bestaetigter Rolle
 *  - Superagent zeigt „LIVE · AKTIV" nur bei echtem aktiven Agenten
 *  - Prozentveraenderung nur bei realen Vergleichsdaten
 */
import { describe, expect, it } from "vitest";

import {
  chatStatusCopy,
  formatUptime,
  greetName,
  mapActivity,
  mapChatStatus,
  mapSuperAgentStatus,
  mapSystemStatus,
  mapWorkspaceStatus,
  roleBadge,
  sessionState,
  sparklineGeometry,
  superAgentStatusCopy,
  systemStatusCopy,
  workspaceStatusCopy,
} from "../lib/dashboard-view-model";

const NOW = 1_800_000_000_000;

describe("Sprint 156: Dashboard-View-Model", () => {
  it("greetName: echter Name, Fallback Sarah", () => {
    expect(greetName("Nik")).toBe("Nik");
    expect(greetName("  ")).toBe("Sarah");
    expect(greetName(null)).toBe("Sarah");
  });

  it("roleBadge: Administrator NUR bei bestaetigter admin-Rolle", () => {
    expect(roleBadge("admin")).toBe("Administrator");
    expect(roleBadge("ADMIN")).toBe("Administrator");
    expect(roleBadge("user")).toBe("Benutzer");
    expect(roleBadge(null)).toBe(null);
    expect(roleBadge("unknown")).toBe(null);
    expect(roleBadge(undefined)).toBe(null);
  });

  it("roleBadge: client-only Admin-Freischaltung bleibt ausgeschlossen", () => {
    // „isAdmin" im Query-String, Gross-/Kleinschreibung ohne Backendbestaetigung
    expect(roleBadge("Admin?local=true")).toBe(null);
  });

  it("sessionState: online / anmeldung / abgelaufen", () => {
    expect(sessionState(true, false)).toBe("online");
    expect(sessionState(false, false)).toBe("anmeldung-erforderlich");
    expect(sessionState(false, true)).toBe("sitzung-abgelaufen");
  });

  it("formatUptime: echte Werte — unbekannt bleibt — (kein 99,9%-Fake)", () => {
    expect(formatUptime(null)).toBe("—");
    expect(formatUptime(undefined)).toBe("—");
    expect(formatUptime(Number.NaN)).toBe("—");
    expect(formatUptime(90_000)).toBe("1 min");
    expect(formatUptime(3_600_000)).toBe("1 h 0 min");
    expect(formatUptime((2 * 24 + 5) * 3_600_000)).toBe("2 d 5 h");
  });

  it("mapSystemStatus: checking/degraded/healthy/offline korrekt abgeleitet", () => {
    expect(mapSystemStatus({ reachable: true, checking: true, hasRecentErrors: false, workspaceReachable: null }).status).toBe("checking");
    expect(mapSystemStatus({ reachable: true, checking: false, hasRecentErrors: true, workspaceReachable: null }).status).toBe("degraded");
    expect(mapSystemStatus({ reachable: true, checking: false, hasRecentErrors: false, workspaceReachable: true }).status).toBe("healthy");
    expect(mapSystemStatus({ reachable: false, checking: false, hasRecentErrors: false, workspaceReachable: null }).status).toBe("offline");
    // Workspace nicht erreichbar => NIEMALS „Alle Systeme aktiv"
    expect(systemStatusCopy[mapSystemStatus({ reachable: true, checking: false, hasRecentErrors: false, workspaceReachable: false }).status]).not.toBe(systemStatusCopy.healthy);
  });

  it("mapChatStatus: unavailable ohne Provider, checking ohne Health, ready mit Name", () => {
    expect(mapChatStatus({ providersConfigured: 0 }).status).toBe("unavailable");
    expect(chatStatusCopy.unavailable).toBe("Kein Provider verfügbar");
    expect(mapChatStatus({ providersConfigured: null }).status).toBe("unknown");
    expect(mapChatStatus({ providersConfigured: 2 }).status).toBe("checking");
    expect(mapChatStatus({ providersConfigured: 2, activeProvider: "OpenAI", activeModel: "gpt-4o-mini" })).toEqual({
      status: "ready",
      provider: "OpenAI",
      model: "gpt-4o-mini",
    });
    // Kein geratener Providername ohne Health-Bestaetigung
    expect(mapChatStatus({ providersConfigured: 3 }).provider).toBeUndefined();
  });

  it("mapWorkspaceStatus: nicht konfiguriert => 0 und keine erfundene Zahl", () => {
    expect(mapWorkspaceStatus({ configured: false, reachable: false, count: null })).toEqual({ status: "unavailable", count: 0 });
    expect(workspaceStatusCopy.unavailable).toBe("Nicht verbunden");
    expect(mapWorkspaceStatus({ configured: true, reachable: null, count: 5 })).toEqual({ status: "unknown", count: null });
    expect(mapWorkspaceStatus({ configured: true, reachable: true, count: 4 })).toEqual({ status: "ready", count: 4 });
  });

  it("mapSuperAgentStatus: offline wenn Backend nicht erreichbar (kein LIVE·AKTIV-Fake)", () => {
    const result = mapSuperAgentStatus({
      reachable: false,
      loadError: false,
      agents: [{ status: "aktiv", lastActiveAt: new Date(NOW).toISOString() }],
      now: NOW,
    });
    expect(result.status).toBe("offline");
    expect(superAgentStatusCopy[result.status]).toBe("OFFLINE");
  });

  it("mapSuperAgentStatus: unconfigured ohne Agenten", () => {
    const result = mapSuperAgentStatus({ reachable: true, loadError: false, agents: [], now: NOW });
    expect(result.status).toBe("unconfigured");
    expect(superAgentStatusCopy[result.status]).toBe("NICHT KONFIGURIERT");
  });

  it("mapSuperAgentStatus: active nur bei Agent-Status aktiv MIT frueher Aktivitaet", () => {
    const fresh = mapSuperAgentStatus({
      reachable: true,
      loadError: false,
      agents: [{ status: "aktiv", lastActiveAt: new Date(NOW - 3_600_000).toISOString() }],
      now: NOW,
    });
    expect(fresh.status).toBe("active");
    expect(superAgentStatusCopy.active).toBe("LIVE · AKTIV");

    // Status „aktiv", aber letzte Aktivitaet aelter als 24 h => kein LIVE·AKTIV
    const stale = mapSuperAgentStatus({
      reachable: true,
      loadError: false,
      agents: [{ status: "aktiv", lastActiveAt: new Date(NOW - 48 * 3_600_000).toISOString() }],
      now: NOW,
    });
    expect(stale.status).not.toBe("active");
  });

  it("mapSuperAgentStatus: paused bei nur pausierten, error bei Ladefehler", () => {
    expect(
      mapSuperAgentStatus({ reachable: true, loadError: false, agents: [{ status: "pausiert", lastActiveAt: new Date(NOW).toISOString() }], now: NOW }).status,
    ).toBe("paused");
    expect(mapSuperAgentStatus({ reachable: true, loadError: true, agents: [], now: NOW }).status).toBe("error");
  });

  it("mapActivity: keine Prozentveraenderung ohne Vergleichsdaten, keine Fake-Sparkline", () => {
    const ohneDaten = mapActivity({ countLast24h: null, previousCount: null });
    expect(ohneDaten).toEqual({ count: null, changePercent: null, points: [] });

    const ohneVergleich = mapActivity({ countLast24h: 12, previousCount: null, points: null });
    expect(ohneVergleich.changePercent).toBe(null);
    expect(ohneVergleich.points).toEqual([]);

    const mitVergleich = mapActivity({ countLast24h: 15, previousCount: 10, points: [1, 2, 3] });
    expect(mitVergleich.changePercent).toBe(50);
    expect(mitVergleich.points).toEqual([1, 2, 3]);
  });

  it("mapActivity: negative und naive Prozentwerte korrekt gerundet", () => {
    expect(mapActivity({ countLast24h: 9, previousCount: 12 }).changePercent).toBe(-25);
    expect(mapActivity({ countLast24h: 1, previousCount: 0 }).changePercent).toBe(null);
    expect(mapActivity({ countLast24h: 3, previousCount: 3 }).changePercent).toBe(0);
  });

  it("sparklineGeometry: leere/punktuelle Daten => leere Geometrie", () => {
    expect(sparklineGeometry([])).toEqual([]);
    expect(sparklineGeometry([5])).toEqual([]);
    const geo = sparklineGeometry([1, 2, 3]);
    expect(geo).toHaveLength(3);
    expect(geo[0]).toEqual({ x: 0, y: 0 });
    expect(geo[2]).toEqual({ x: 1, y: 1 });
    expect(sparklineGeometry([7, 7, 7]).every((p) => p.y === 0.5)).toBe(true);
  });

  it("Status-Copy-Mapping ist vollstaendig (UI-Texte deutsch)", () => {
    expect(Object.keys(superAgentStatusCopy).sort()).toEqual(
      ["active", "error", "offline", "paused", "ready", "unconfigured"].sort(),
    );
    expect(systemStatusCopy.healthy).toBe("Alle Systeme aktiv");
    expect(chatStatusCopy.ready).toBe("Bereit für deine Fragen");
    expect(workspaceStatusCopy.ready).toBe("Service erreichbar");
  });
});
