import { describe, expect, it } from "vitest";
import {
  buildAdminLiveStatusViewModel,
  buildPreviewViewModel,
  formatPingLabel,
  formatUptimeLabel,
  getConnectionBadge,
  getRuntimeStateBadge,
  resolvePreviewTargetUrl,
} from "../lib/live-runtime-view-logic";
import type { LiveRuntimeStatus } from "../lib/live-runtime-client";

function status(overrides: Partial<LiveRuntimeStatus> = {}): LiveRuntimeStatus {
  return {
    state: "running",
    stateLabel: "Online",
    activeUrl: "https://app.cybersarah-ki.com",
    port: 8000,
    connectionKind: "sse",
    pingMs: 120,
    logCount: 5,
    serverUptimeMs: 900_000,
    timestamp: 1_789_000_000_000,
    ...overrides,
  };
}

describe("live-runtime-view-logic", () => {
  it("zeigt den Laufzeit-Zustand als Badge mit passendem Ton", () => {
    expect(getRuntimeStateBadge("running")).toEqual({ label: "Online", tone: "ready" });
    expect(getRuntimeStateBadge("building").tone).toBe("neutral");
    expect(getRuntimeStateBadge("error").tone).toBe("warning");
    expect(getRuntimeStateBadge("stopped").tone).toBe("warning");
    expect(getRuntimeStateBadge(null)).toEqual({ label: "Status unbekannt", tone: "neutral" });
    expect(getRuntimeStateBadge(undefined)).toEqual({ label: "Status unbekannt", tone: "neutral" });
  });

  it("uebersetzt jeden Verbindungs-Zustand ehrlich", () => {
    expect(getConnectionBadge("streaming")).toEqual({ label: "Live-Stream (SSE)", tone: "ready" });
    expect(getConnectionBadge("polling").tone).toBe("ready");
    expect(getConnectionBadge("offline")).toEqual({ label: "Offline", tone: "warning" });
    expect(getConnectionBadge("connecting")).toEqual({ label: "Verbinde …", tone: "neutral" });
  });

  it("formatiert Uptime kompakt und toleriert fehlende Werte", () => {
    expect(formatUptimeLabel(30_000)).toBe("< 1 min");
    expect(formatUptimeLabel(900_000)).toBe("15 min");
    expect(formatUptimeLabel(3_840_000)).toBe("1 h 04 min");
    expect(formatUptimeLabel(7_200_000)).toBe("2 h");
    expect(formatUptimeLabel(null)).toBe("–");
    expect(formatUptimeLabel(-5)).toBe("–");
    expect(formatUptimeLabel(Number.NaN)).toBe("–");
  });

  it("formatiert die Latenz in Millisekunden oder ehrlich mit Gedankenstrich", () => {
    expect(formatPingLabel(127.6)).toBe("128 ms");
    expect(formatPingLabel(0)).toBe("0 ms");
    expect(formatPingLabel(null)).toBe("–");
    expect(formatPingLabel(-1)).toBe("–");
  });

  it("bevorzugt die Workspace-Preview vor der API-Basis", () => {
    expect(resolvePreviewTargetUrl("https://ws.example.com/", "https://api.example.com")).toBe("https://ws.example.com/preview");
    expect(resolvePreviewTargetUrl("  https://ws.example.com", "https://api.example.com")).toBe("https://ws.example.com/preview");
    expect(resolvePreviewTargetUrl(null, "https://api.example.com")).toBe("https://api.example.com");
    expect(resolvePreviewTargetUrl("", "https://api.example.com")).toBe("https://api.example.com");
    expect(resolvePreviewTargetUrl(undefined, "https://api.example.com")).toBe("https://api.example.com");
  });

  it("baut das View-Modell im Live-Fall mit Status, URL und Clear-Freigabe", () => {
    const vm = buildPreviewViewModel({
      status: status(),
      connection: "streaming",
      previewUrl: "https://ws.example.com/preview",
      isAdmin: true,
      logEntryCount: 5,
    });
    expect(vm.isLive).toBe(true);
    expect(vm.stateBadge.label).toBe("Online");
    expect(vm.connectionBadge.label).toBe("Live-Stream (SSE)");
    expect(vm.headline).toContain("https://app.cybersarah-ki.com");
    expect(vm.urlLabel).toBe("https://ws.example.com/preview");
    expect(vm.uptimeLabel).toBe("15 min");
    expect(vm.pingLabel).toBe("120 ms");
    expect(vm.logCountLabel).toBe("5 Ereignis(se)");
    expect(vm.showClearButton).toBe(true);
    expect(vm.description).toContain("Live-Protokoll");
  });

  it("baut ein ehrliches Offline-Modell ohne Status", () => {
    const vm = buildPreviewViewModel({
      status: null,
      connection: "offline",
      previewUrl: null,
      isAdmin: false,
      logEntryCount: 0,
    });
    expect(vm.isLive).toBe(false);
    expect(vm.stateBadge).toEqual({ label: "Status unbekannt", tone: "neutral" });
    expect(vm.connectionBadge).toEqual({ label: "Offline", tone: "warning" });
    expect(vm.headline).toBe("Runtime-Status wird geladen …");
    expect(vm.urlLabel).toBe("Keine Preview-URL");
    expect(vm.uptimeLabel).toBe("–");
    expect(vm.pingLabel).toBe("–");
    expect(vm.showClearButton).toBe(false);
    expect(vm.description).toContain("konnte noch nicht geladen werden");
  });

  it("verhindert das Leeren ohne Admin oder ohne Ereignisse", () => {
    const base = { status: status(), connection: "polling" as const, previewUrl: "https://api.example.com" };
    expect(buildPreviewViewModel({ ...base, isAdmin: false, logEntryCount: 3 }).showClearButton).toBe(false);
    expect(buildPreviewViewModel({ ...base, isAdmin: true, logEntryCount: 0 }).showClearButton).toBe(false);
    expect(buildPreviewViewModel({ ...base, isAdmin: true, logEntryCount: 3 }).showClearButton).toBe(true);
  });

  it("beschreibt das Polling-Modell mit periodischer Neupruefung", () => {
    const vm = buildPreviewViewModel({
      status: status({ state: "stopped", stateLabel: "Gestoppt" }),
      connection: "polling",
      previewUrl: "https://api.example.com",
      isAdmin: true,
      logEntryCount: 1,
    });
    expect(vm.isLive).toBe(true);
    expect(vm.stateBadge).toEqual({ label: "Gestoppt", tone: "warning" });
    expect(vm.description).toContain("Live-Protokoll");
    expect(vm.logCountLabel).toBe("1 Ereignis(se)");
  });
});

describe("buildAdminLiveStatusViewModel (Sprint 148)", () => {
  it("liefert fuer einen laufenden, fehlerfreien Server einen gruenen, ehrlichen Status", () => {
    const vm = buildAdminLiveStatusViewModel({
      status: { state: "running", serverUptimeMs: 90_000, pingMs: 42, logCount: 7 },
      issueEntries: [{ level: "info", source: "server", message: "x", atMs: 1 }],
      isAdmin: true,
    });
    expect(vm.isHealthy).toBe(true);
    expect(vm.stateBadge.label).toBe("Online");
    expect(vm.stateBadge.tone).toBe("ready");
    expect(vm.uptimeLabel).toBe("1 min");
    expect(vm.pingLabel).toBe("42 ms");
    expect(vm.logCountLabel).toBe("7 im Ringpuffer");
    expect(vm.errorCountLabel).toBe("keine Fehler/Warnungen");
    expect(vm.recentIssueLines).toHaveLength(0);
    expect(vm.showClearButton).toBe(true);
  });

  it("zeigt bei Fehlerzustand rot und nimmt nur error/warn-Eintraege in die Kurzliste (max. 3, neueste zuerst)", () => {
    const vm = buildAdminLiveStatusViewModel({
      status: { state: "error", serverUptimeMs: 1_000, pingMs: null, logCount: 3 },
      issueEntries: [
        { level: "error", source: "llm", message: "Timeout A", atMs: 10 },
        { level: "info", source: "llm", message: "sollte nicht erscheinen", atMs: 11 },
        { level: "warn", source: "db", message: "Warnung B", atMs: 12 },
        { level: "error", source: "ws", message: "Timeout C", atMs: 13 },
      ],
      isAdmin: true,
    });
    expect(vm.isHealthy).toBe(false);
    expect(vm.stateBadge.tone).toBe("warning");
    expect(vm.pingLabel).toBe("–");
    expect(vm.recentIssueLines.map((entry) => entry.message)).toEqual(["Timeout C", "Warnung B", "Timeout A"]);
    expect(vm.errorCountLabel).toBe("2 Fehler (3 Ereignis(se))");
  });

  it("weist ohne Statusdaten ehrlich 'unbekannt' statt erfundener Werte aus", () => {
    const vm = buildAdminLiveStatusViewModel({ status: null, isAdmin: false });
    expect(vm.statusLoaded).toBe(false);
    expect(vm.stateBadge.label).toBe("Status unbekannt");
    expect(vm.headline).toBe("Backend-Status wird geladen …");
    expect(vm.logCountLabel).toBe("unbekannt");
    expect(vm.showClearButton).toBe(false);
    expect(vm.isHealthy).toBe(false);
  });

  it("versteckt den Leeren-Button fuer Nicht-Admins (HITL-Schutz)", () => {
    const vm = buildAdminLiveStatusViewModel({
      status: { state: "running", serverUptimeMs: 60_000, pingMs: 10, logCount: 9 },
      isAdmin: false,
    });
    expect(vm.showClearButton).toBe(false);
  });
});
