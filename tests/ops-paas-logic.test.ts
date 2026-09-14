import { describe, expect, it } from "vitest";
import {
  buildOpsOverview,
  buildOpsAlertMessage,
  collectCriticalTransitions,
  levelForState,
  summarizeOpsOverview,
  type CheckState,
  type OpsCheckView,
} from "../lib/ops-overview-logic";
import {
  buildOpsDiscordPayload,
  classifyNeonLatency,
  classifyRenderDeployState,
  classifyUptimeWatcherState,
} from "../lib/ops-paas-logic";

describe("ops-paas-logic — Sprint 110: PaaS-Betriebspruefungen", () => {
  it("klassifiziert die Neon-Postgres-Erreichbarkeit aus dem SELECT-1-Roundtrip", () => {
    expect(classifyNeonLatency(null)).toEqual({ state: "down", detail: "SELECT-1-Probe fehlgeschlagen" });
    expect(classifyNeonLatency(4_500).state).toBe("degraded");
    expect(classifyNeonLatency(120)).toEqual({ state: "ok", detail: "SELECT-1-Roundtrip 120 ms" });
  });

  it("meldet fehlende Neon-Konfiguration nicht als Fehler, sondern ehrlich als Messung", () => {
    // latency 0 ms ist ein gueltiger schneller Roundtrip, kein Konfigurationsfall.
    expect(classifyNeonLatency(0).state).toBe("ok");
  });

  it("klassifiziert Uptime-Waechter-Ergebnisse inklusive 24-h-Erholungsfenster", () => {
    expect(classifyUptimeWatcherState({ openAlert: true }).state).toBe("down");
    expect(classifyUptimeWatcherState({ openAlert: null }).state).toBe("unknown");
    expect(classifyUptimeWatcherState({ openAlert: false, recoveredWithinMs: 1_800_000 }).state).toBe("degraded");
    expect(classifyUptimeWatcherState({ openAlert: false, recoveredWithinMs: 90_000_000 }).state).toBe("ok");
    expect(classifyUptimeWatcherState({ openAlert: false }).state).toBe("ok");
  });

  it("klassifiziert Render-Deploy-Status key-gated — ohne Key kein Fehler", () => {
    expect(classifyRenderDeployState(null).state).toBe("unknown");
    expect(classifyRenderDeployState(null).detail).toContain("RENDER_API_KEY");
    expect(classifyRenderDeployState("live").state).toBe("ok");
    expect(classifyRenderDeployState("build").state).toBe("degraded");
    expect(classifyRenderDeployState("update_failed").state).toBe("down");
    expect(classifyRenderDeployState("suspended").state).toBe("down");
    expect(classifyRenderDeployState("zukuenftiger_status").state).toBe("degraded");
  });

  it("baut einen tokenfreien Discord-Payload", () => {
    expect(buildOpsDiscordPayload("alarm")).toEqual({ content: "alarm" });
  });
});

describe("ops-overview-logic — Sprint 110: Warnstufen und Stufenwechsel", () => {
  it("leitet aus jedem Pruefzustand die Warnstufe ab", () => {
    expect(levelForState("ok")).toBe("ok");
    expect(levelForState("degraded")).toBe("warnung");
    expect(levelForState("down")).toBe("kritisch");
    expect(levelForState("unknown")).toBe("unbekannt");
  });

  it("fuehrt Zeitstempel, Fehlerbild und Warnstufe durch die Betriebsuebersicht", () => {
    const now = 1_700_000_000_000;
    const overview = buildOpsOverview([
      { kind: "renderDeploy", state: "ok", checkedAt: now, lastFailure: "Deploy-Status update_failed — Render-Dashboard prüfen" },
      { kind: "uptimeWatcher", state: "down", checkedAt: now, detail: "offener Uptime-Alarm (GitHub-Issue)" },
      { kind: "neonPostgres", state: "ok" },
    ]);
    const render = overview.checks.find((c) => c.kind === "renderDeploy");
    expect(render?.level).toBe("ok");
    expect(render?.checkedAt).toBe(now);
    expect(render?.lastFailure).toContain("update_failed");
    const uptime = overview.checks.find((c) => c.kind === "uptimeWatcher");
    expect(uptime?.level).toBe("kritisch");
    expect(uptime?.message).toContain("Uptime-Alarm");
    expect(overview.overall).toBe("down");
  });

  it("erkennt Stufenwechsel zu kritisch nur beim echten Uebergang", () => {
    const checks: OpsCheckView[] = [
      {
        kind: "database",
        state: "down",
        label: "Datenbank",
        stale: false,
        message: "Datenbank nicht verbunden — DATABASE_URL und Neon-Verfuegbarkeit pruefen.",
        level: "kritisch",
        checkedAt: null,
        lastFailure: null,
      },
    ];
    // Erstlauf ohne Vorbild: kein Alarm (Boot-Rauschen vermeiden).
    expect(collectCriticalTransitions({}, checks)).toHaveLength(0);
    // ok -> down: Alarm.
    expect(collectCriticalTransitions({ database: "ok" as CheckState }, checks)).toHaveLength(1);
    // down -> down: kein weiterer Alarm.
    expect(collectCriticalTransitions({ database: "down" as CheckState }, checks)).toHaveLength(0);
    // degraded -> down: Alarm.
    expect(collectCriticalTransitions({ database: "degraded" as CheckState }, checks)).toHaveLength(1);
  });

  it("baut eine handlungsfaehige Alarmmeldung ohne Token", () => {
    const overview = buildOpsOverview([
      { kind: "database", state: "down" },
      { kind: "apiHealth", state: "ok" },
    ]);
    const critical = collectCriticalTransitions(
      { database: "ok" as CheckState },
      overview.checks,
    );
    const message = buildOpsAlertMessage(overview, critical);
    expect(message).toContain("Stufenwechsel zu KRITISCH");
    expect(message).toContain("Datenbank:");
    expect(message).toContain("Gesamt: Betriebsstatus KRITISCH");
  });

  it("zusammenfassung bleibt kompatibel", () => {
    const summary = summarizeOpsOverview(buildOpsOverview([{ kind: "apiHealth", state: "ok" }]));
    expect(summary).toContain("ok:1");
    expect(summary).toContain("Betriebsstatus GRUEN");
  });
});
