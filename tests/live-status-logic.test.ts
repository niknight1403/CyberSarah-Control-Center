import { describe, expect, it } from "vitest";
import {
  MAX_RUNTIME_LOG_ENTRIES,
  buildRuntimeStatusSnapshot,
  classifyLatency,
  classifyRuntimeState,
  filterRuntimeLogs,
  formatLogSseEvent,
  normalizeRuntimeLogEntry,
  pushRuntimeLog,
  runtimeStateLabel,
} from "../lib/live-status-logic";

const NOW = 1_762_600_000_000;

describe("live-status-logic", () => {
  it("klassifiziert Laufzeit-Zustaende aus messbaren Fakten", () => {
    expect(classifyRuntimeState({ processUp: true, nowMs: NOW })).toBe("running");
    expect(classifyRuntimeState({ processUp: false, nowMs: NOW })).toBe("stopped");
    expect(
      classifyRuntimeState({ processUp: true, buildActive: true, nowMs: NOW }),
    ).toBe("building");
    expect(
      classifyRuntimeState({
        processUp: true,
        lastErrorAtMs: NOW - 5_000,
        nowMs: NOW,
      }),
    ).toBe("error");
    expect(
      classifyRuntimeState({
        processUp: true,
        lastErrorAtMs: NOW - 120_000,
        nowMs: NOW,
      }),
    ).toBe("running");
    expect(
      classifyRuntimeState({ processUp: true, lastProbeFailed: true, nowMs: NOW }),
    ).toBe("error");
    expect(
      classifyRuntimeState({
        processUp: true,
        lastProbeFailed: true,
        lastHeartbeatAtMs: NOW - 1_000,
        nowMs: NOW,
      }),
    ).toBe("running");
  });

  it("liefert humanlesbare Zustandslabels", () => {
    expect(runtimeStateLabel("running")).toBe("Online");
    expect(runtimeStateLabel("building")).toBe("Baut");
    expect(runtimeStateLabel("error")).toBe("Fehler");
    expect(runtimeStateLabel("stopped")).toBe("Gestoppt");
  });

  it("normalisiert Logzeilen tolerante (Ebenen, Kaetzung, Ids)", () => {
    const entry = normalizeRuntimeLogEntry(
      { level: "quatsch" as unknown as "info", source: "  ", message: "Hallo   ", atMs: NOW },
      "fallback-id",
    );
    expect(entry.level).toBe("info");
    expect(entry.source).toBe("server");
    expect(entry.message).toBe("Hallo");
    expect(entry.id).toBe("fallback-id");
    expect(entry.atMs).toBe(NOW);

    const autoNow = normalizeRuntimeLogEntry({ atMs: Number.NaN }, "x");
    expect(autoNow.atMs).toBeGreaterThan(0);
  });

  it("haelt den Ringpuffer begrenzt und stabil sortiert", () => {
    let buffer: ReturnType<typeof pushRuntimeLog> = [];
    for (let i = 0; i < MAX_RUNTIME_LOG_ENTRIES + 25; i += 1) {
      buffer = pushRuntimeLog(
        buffer,
        normalizeRuntimeLogEntry({ message: `zeile-${i}`, atMs: i }, `id-${i}`),
      );
    }
    expect(buffer).toHaveLength(MAX_RUNTIME_LOG_ENTRIES);
    expect(buffer[0].message).toBe("zeile-25");
    expect(buffer[buffer.length - 1].message).toBe(
      `zeile-${MAX_RUNTIME_LOG_ENTRIES + 24}`,
    );
    expect(pushRuntimeLog([], normalizeRuntimeLogEntry({}, "a"), 0).length).toBe(1);
  });

  it("filtert nach Ebenen und Suchtext gross-/klein-unabhaengig", () => {
    const buffer = [
      normalizeRuntimeLogEntry({ level: "error", message: "Kritisch: DB weg", source: "db" }, "1"),
      normalizeRuntimeLogEntry({ level: "info", message: "Request abgeschlossen", source: "api" }, "2"),
      normalizeRuntimeLogEntry({ level: "success", message: "Deploy ok", source: "render" }, "3"),
    ];
    expect(filterRuntimeLogs(buffer, { levels: ["error"] })).toHaveLength(1);
    expect(filterRuntimeLogs(buffer, { query: "db" })).toHaveLength(1);
    expect(filterRuntimeLogs(buffer, { query: "REQUEST" })).toHaveLength(1);
    expect(filterRuntimeLogs(buffer)).toHaveLength(3);
  });

  it("erzeugt deterministische SSE-Zeilen", () => {
    const entry = normalizeRuntimeLogEntry(
      { level: "warn", message: "Kaltstart", atMs: NOW },
      "sse-1",
    );
    expect(formatLogSseEvent(entry)).toBe(
      `data: {"id":"sse-1","level":"warn","source":"server","message":"Kaltstart","atMs":${NOW}}\n\n`,
    );
  });

  it("klassifiziert Latenzen mit Toleranzband", () => {
    expect(classifyLatency(80).tone).toBe("good");
    expect(classifyLatency(250).tone).toBe("ok");
    expect(classifyLatency(900).tone).toBe("bad");
    expect(classifyLatency(null)).toEqual({ tone: "bad", label: "—" });
    expect(classifyLatency(Number.NaN).label).toBe("—");
  });

  it("baut tokenfreie Status-Snapshots", () => {
    const snapshot = buildRuntimeStatusSnapshot({
      input: { processUp: true, nowMs: NOW },
      activeUrl: "https://app.cybersarah-ki.com",
      port: 3001,
      connectionKind: "sse",
      pingMs: 87.4,
      buffer: [normalizeRuntimeLogEntry({}, "l1")],
      serverUptimeMs: 45_000,
    });
    expect(snapshot.state).toBe("running");
    expect(snapshot.stateLabel).toBe("Online");
    expect(snapshot.pingMs).toBe(87);
    expect(snapshot.logCount).toBe(1);
    expect(snapshot.timestamp).toBe(NOW);
    expect(JSON.stringify(snapshot)).not.toContain("token");
  });
});
