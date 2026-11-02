import { describe, expect, it } from "vitest";
import {
  AUTO_REMEDY_COOLDOWN_MS,
  DEDUPE_WINDOW_MS,
  MAX_EVIDENCE_PER_INCIDENT,
  SIGNATURE_RULES,
  buildAnalysisObjective,
  classifyLogLine,
  mergeIncident,
  remedyFor,
  shouldAutoRemedy,
} from "@/lib/self-healing-logic";
import type { SelfHealingIncident } from "@/lib/self-healing-logic";

const baseIncidentInput = {
  source: "server_log" as const,
  signature: "db_connection" as const,
  severity: "critical" as const,
  finding: "Datenbank-Verbindungsproblem (Neon) — Pool-Erschoepfung oder Netzwerk.",
  evidence: ["Error: ECONNREFUSED 127.0.0.1:5432"],
};

const fixedNow = new Date("2026-10-03T04:15:00.000Z");

function incidentAt(overrides: Partial<SelfHealingIncident> = {}): SelfHealingIncident {
  return {
    id: "inc-existing",
    source: "server_log",
    signature: "db_connection",
    severity: "critical",
    finding: "Datenbank-Verbindungsproblem (Neon) — Pool-Erschoepfung oder Netzwerk.",
    evidence: ["Error: ECONNREFUSED 127.0.0.1:5432"],
    status: "detected",
    occurrenceCount: 1,
    firstSeenAt: "2026-10-03T04:10:00.000Z",
    lastSeenAt: "2026-10-03T04:14:00.000Z",
    ...overrides,
  };
}

describe("self-healing logic — Signaturklassifikation", () => {
  it("ordnet bekannte Ausfaelle der richtigen Signatur und Severity zu", () => {
    expect(classifyLogLine("error", "FATAL ERROR: JavaScript heap out of memory")).toMatchObject({ signature: "out_of_memory", severity: "critical" });
    expect(classifyLogLine("error", "Error [ERR_REQUIRE_ESM]: require() of ES Module")).toMatchObject({ signature: "esm_interop", severity: "critical" });
    expect(classifyLogLine("error", "Error: ECONNREFUSED 10.0.0.5:5432")).toMatchObject({ signature: "db_connection", severity: "critical" });
    expect(classifyLogLine("error", "listen EADDRINUSE: address already in use :::3000")).toMatchObject({ signature: "port_in_use", severity: "critical" });
    expect(classifyLogLine("warn", "TypeError: cannot read properties of undefined")).toMatchObject({ signature: "stack_trace", severity: "medium" });
    expect(classifyLogLine("error", "UnhandledPromiseRejection: reason")).toMatchObject({ signature: "unhandled_rejection", severity: "medium" });
    expect(classifyLogLine("warn", "Request timeout after 30000ms exceeded")).toMatchObject({ signature: "api_timeout", severity: "medium" });
    expect(classifyLogLine("error", "Upstream returned HTTP 503")).toMatchObject({ signature: "http_5xx", severity: "medium" });
  });

  it("respektiert die Regel-Prioritaet bei mehrdeutigen Logzeilen", () => {
    expect(classifyLogLine("error", "ECONNREFUSED while binding, EADDRINUSE")?.signature).toBe("db_connection");
    expect(classifyLogLine("error", "TypeError: x — JavaScript heap out of memory")?.signature).toBe("out_of_memory");
  });

  it("ignoriert Info-Logs ohne Fehlerbegriff, prueft aber Info-Logs mit Fehlerbegriff", () => {
    expect(classifyLogLine("info", "Server gestartet auf Port 3000")).toBeNull();
    expect(classifyLogLine("debug", "request handled in 12ms")).toBeNull();
    expect(classifyLogLine("info", "provider error: ECONNREFUSED")?.signature).toBe("db_connection");
  });

  it("markiert error-Level ohne bekannte Signatur als unknown_error, warnt aber nicht ueber beliebige Texte", () => {
    expect(classifyLogLine("error", "unexpected failure in worker")).toMatchObject({ signature: "unknown_error", severity: "low" });
    expect(classifyLogLine("warn", "unexpected failure in worker")).toBeNull();
    expect(classifyLogLine("error", "alles gut")).toBeNull();
  });

  it("scannt nur die ersten 2000 Zeichen einer Logzeile", () => {
    const padded = `${"x".repeat(2000)} Error: ECONNREFUSED 127.0.0.1:5432`;
    expect(classifyLogLine("error", padded)).toBeNull();
    const inRange = `${"x".repeat(1900)} EADDRINUSE`;
    expect(classifyLogLine("error", inRange)?.signature).toBe("port_in_use");
  });

  it("liefert fuer jede Signatur eine Remedy und fuer Unbekanntes 'none'", () => {
    for (const rule of SIGNATURE_RULES) {
      expect(remedyFor(rule.id)).toBe(rule.remedy);
    }
    expect(remedyFor("unknown_error")).toBe("none");
  });

  it("fuehrt nur Port-Konflikte auf einen automatischen Redeploy", () => {
    expect(remedyFor("port_in_use")).toBe("redeploy");
    expect(remedyFor("db_connection")).toBe("analyze");
    expect(remedyFor("api_timeout")).toBe("none");
  });
});

describe("self-healing logic — Incident-Zusammenfuehrung", () => {
  it("legt fuer eine unbekannte Signatur ein neues Incident an", () => {
    const { incidents, incident, isNew } = mergeIncident([], baseIncidentInput, fixedNow);

    expect(isNew).toBe(true);
    expect(incidents).toHaveLength(1);
    expect(incident.status).toBe("detected");
    expect(incident.occurrenceCount).toBe(1);
    expect(incident.firstSeenAt).toBe(fixedNow.toISOString());
    expect(incident.lastSeenAt).toBe(fixedNow.toISOString());
    expect(incident.id).toMatch(/^inc-/);
    expect(incident.evidence).toHaveLength(1);
  });

  it("erhoeht innerhalb des Dedupe-Fensters den Zaehler statt ein Duplikat zu erzeugen", () => {
    const existing = incidentAt({ occurrenceCount: 2 });
    const later = new Date(Date.parse(existing.lastSeenAt) + DEDUPE_WINDOW_MS - 1);

    const { incidents, incident, isNew } = mergeIncident([existing], { ...baseIncidentInput, evidence: ["Error: ECONNREFUSED 10.0.0.9:5432"] }, later);

    expect(isNew).toBe(false);
    expect(incidents).toHaveLength(1);
    expect(incident.occurrenceCount).toBe(3);
    expect(incident.lastSeenAt).toBe(later.toISOString());
    expect(incident.firstSeenAt).toBe(existing.firstSeenAt);
    expect(incident.evidence).toEqual(["Error: ECONNREFUSED 127.0.0.1:5432", "Error: ECONNREFUSED 10.0.0.9:5432"]);
  });

  it("startet nach Ablauf des Dedupe-Fensters ein neues Incident", () => {
    const existing = incidentAt();
    const later = new Date(Date.parse(existing.lastSeenAt) + DEDUPE_WINDOW_MS);

    const { incidents, isNew } = mergeIncident([existing], baseIncidentInput, later);

    expect(isNew).toBe(true);
    expect(incidents).toHaveLength(2);
    expect(incidents[0].id).not.toBe("inc-existing");
  });

  it("trennt Incidents nach Quelle und fasst abgeschlossene Incidents nicht wieder auf", () => {
    const serverIncident = incidentAt();

    const mobileResult = mergeIncident([serverIncident], { ...baseIncidentInput, source: "mobile_crash" }, fixedNow);
    expect(mobileResult.isNew).toBe(true);
    expect(mobileResult.incidents).toHaveLength(2);

    for (const status of ["acknowledged", "remedied"] as const) {
      const closed = incidentAt({ id: `inc-${status}`, status });
      const result = mergeIncident([closed], baseIncidentInput, fixedNow);
      expect(result.isNew).toBe(true);
      expect(result.incidents[0].id).not.toBe(`inc-${status}`);
    }
  });

  it("fuehrt die Severity nach, wenn derselbe Fehler spaeter hoeher eingestuft wird", () => {
    const existing = incidentAt({ severity: "medium" });
    const { incident, isNew } = mergeIncident([existing], { ...baseIncidentInput, severity: "critical" }, fixedNow);

    expect(isNew).toBe(false);
    expect(incident.severity).toBe("critical");
  });

  it("begrenzt Evidenz je Incident und kuerzt einzelne Zeilen", () => {
    const longLine = "y".repeat(900);
    const existing = incidentAt({
      occurrenceCount: MAX_EVIDENCE_PER_INCIDENT,
      evidence: Array.from({ length: MAX_EVIDENCE_PER_INCIDENT }, (_, index) => `line-${index}`),
    });

    const { incident } = mergeIncident([existing], { ...baseIncidentInput, evidence: [longLine] }, fixedNow);

    expect(incident.evidence).toHaveLength(MAX_EVIDENCE_PER_INCIDENT);
    expect(incident.evidence.at(-1)).toBe("y".repeat(500));
    expect(incident.evidence[0]).toBe("line-1");
  });

  it("deckelt das Ledger auf 200 Incidents und stellt neueste voran", () => {
    const full = Array.from({ length: 200 }, (_, index) => incidentAt({ id: `inc-${index}`, signature: "api_timeout", status: "acknowledged" }));

    const { incidents, isNew } = mergeIncident(full, baseIncidentInput, fixedNow);

    expect(isNew).toBe(true);
    expect(incidents).toHaveLength(200);
    expect(incidents[0].signature).toBe("db_connection");
    expect(incidents.at(-1)?.id).toBe("inc-198");
  });
});

describe("self-healing logic — automatische Remedy-Freigabe", () => {
  it("verweigert Remedy ohne Gegenmassnahme und bei niedriger Severity", () => {
    expect(shouldAutoRemedy(incidentAt({ signature: "api_timeout", severity: "medium" }), {}, fixedNow)).toBe(false);
    expect(shouldAutoRemedy(incidentAt({ severity: "low" }), {}, fixedNow)).toBe(false);
    expect(shouldAutoRemedy(incidentAt({ signature: "port_in_use" }), {}, fixedNow)).toBe(true);
  });

  it("haelt den Cooldown je Signatur ein", () => {
    const recent = new Date(fixedNow.getTime() - AUTO_REMEDY_COOLDOWN_MS + 1000).toISOString();
    expect(shouldAutoRemedy(incidentAt(), { db_connection: recent }, fixedNow)).toBe(false);

    const expired = new Date(fixedNow.getTime() - AUTO_REMEDY_COOLDOWN_MS).toISOString();
    expect(shouldAutoRemedy(incidentAt(), { db_connection: expired }, fixedNow)).toBe(true);

    expect(shouldAutoRemedy(incidentAt(), { port_in_use: recent }, fixedNow)).toBe(true);
  });
});

describe("self-healing logic — Analyse-Ziel", () => {
  it("beschreibt Server-Fehler mit Befund, Signatur und Evidenz", () => {
    const objective = buildAnalysisObjective(incidentAt({ occurrenceCount: 3 }));

    expect(objective).toContain("Server-Fehler");
    expect(objective).toContain("Signatur: db_connection | Severity: critical | Haeufigkeit: 3x");
    expect(objective).toContain(`Erste Detektion: ${incidentAt().firstSeenAt}`);
    expect(objective).toContain("[1] Error: ECONNREFUSED 127.0.0.1:5432");
  });

  it("nennt mobile Crash-Reports beim passenden Ursprung", () => {
    const objective = buildAnalysisObjective(incidentAt({ source: "mobile_crash" }));
    expect(objective).toContain("mobilen Crash-Report");
    expect(objective).not.toContain("Server-Fehler");
  });

  it("uebergibt nur die letzten acht Evidenzzeilen, gekuerzt auf 500 Zeichen", () => {
    const evidence = Array.from({ length: 12 }, (_, index) => `evidenz-${index}-${"z".repeat(600)}`);
    const objective = buildAnalysisObjective(incidentAt({ evidence }));

    expect(objective).not.toContain("[1] evidenz-0-");
    expect(objective).toContain("[1] evidenz-4-");
    expect(objective).toContain("[8] evidenz-11-");
    expect(objective).not.toContain("z".repeat(501));
  });
});
