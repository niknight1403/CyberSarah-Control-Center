import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workflow = readFileSync(".github/workflows/control-center-autopilot.yml", "utf8");

/**
 * Zieht den jq-Ausdruck des Vertrags-Gates direkt aus dem Workflow-YAML.
 * Damit pruefen die Faelle unten genau den Text, der auch in Actions laeuft,
 * und nicht eine Abschrift, die davon abweichen kann.
 */
function gateExpression(): string {
  const match = workflow.match(/gate_problems="\$\(jq -r '([\s\S]*?)' "\$body_file"\)"/);
  if (!match) throw new Error("Vertrags-Gate (gate_problems) nicht im Workflow gefunden");
  return match[1];
}

/** jq ist auf ubuntu-latest vorinstalliert; lokal darf der Test uebersprungen werden. */
function hasJq(): boolean {
  try {
    execFileSync("jq", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Laesst den echten jq-Ausdruck auf einen Server-Antwortkoerper los und gibt
 * die gemeldeten Vertragsverletzungen zurueck (leer = Gate laesst durch).
 */
function evaluateGate(body: unknown): string[] {
  const dir = mkdtempSync(join(tmpdir(), "gate-"));
  try {
    const expression = join(dir, "gate.jq");
    const payload = join(dir, "body.json");
    writeFileSync(expression, gateExpression());
    writeFileSync(payload, JSON.stringify(body));
    const out = execFileSync("jq", ["-r", "-f", expression, payload], { encoding: "utf8" });
    return out.split("\n").filter(line => line.trim() !== "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const healthyRun = {
  result: {
    scans: { hara: { ok: true }, expansion: { ok: true } },
    blocked: [],
    deferred: [],
    growthPulse: {
      generated: 4,
      externalActionsExecuted: 0,
      plan: { spendingAuthorized: false, publishingAuthorized: false, priceChangesAuthorized: false },
    },
    growth: { influencerPersonasLearned: 2, influencerExperimentsQueued: 1, b2bNodes: 7 },
  },
};

describe("Sprint 07: secure scheduled growth worker", () => {
  it("requires token-authenticated HTTPS and hides raw revenue data from logs", () => {
    expect(workflow).toContain('Authorization: Bearer $TOKEN');
    expect(workflow).toContain('case "$BASE_URL" in https://*');
    expect(workflow).not.toContain('cat "$body_file"');
    expect(workflow).toContain("Never echo raw response bodies");
  });
  it("does not automatically retry stateful POST and duplicate growth actions", () => {
    expect(workflow).toContain("--request POST");
    expect(workflow).not.toContain("--retry 2");
    expect(workflow).toContain("concurrency:");
  });
});

describe("Sprint 25: wartende Autopilot-Punkte faerben den 24/7-Lauf nicht rot", () => {
  it("akzeptiert HTTP 200 und 207, weist jeden anderen Status hart ab", () => {
    // Der Server antwortet mit 207, sobald `ok` false ist, also auch wenn nur
    // Konfiguration oder Freigaben warten (server/_core/index.ts).
    expect(workflow).toContain('if [ "$http_code" != "200" ] && [ "$http_code" != "207" ]; then');
    expect(workflow).toContain("::error::Control-Center-Cron antwortet mit HTTP $http_code");
  });
  it("prueft echte Blockaden weiter hart und getrennt von wartenden Punkten", () => {
    expect(workflow).toContain('blocked_count="$(jq -r \'(.result.blocked // []) | length\' "$body_file")"');
    expect(workflow).toContain('deferred_count="$(jq -r \'(.result.deferred // []) | length\' "$body_file")"');
    expect(workflow).toContain('if [ "$blocked_count" != "0" ]; then');
    expect(workflow).toContain("::error::Control-Center-Cron meldet $blocked_count echte Blockade(n)");
  });
  it("meldet wartende Punkte als Warnung statt als Fehler", () => {
    expect(workflow).toContain('if [ "$http_code" = "207" ] || [ "$deferred_count" != "0" ]; then');
    expect(workflow).toContain("::warning::Control-Center-Cron wartet auf $deferred_count Konfigurationspunkt(e)");
    expect(workflow).toContain("Kein Defekt, aber nicht vollstaendig abgeschlossen.");
  });
  it("wertet die Gates ohne globales `.ok` aus, damit wartende Punkte den Job nicht kippen", () => {
    const expression = gateExpression();
    // Geprueft werden die Einzelscans, nicht das globale `.ok`, das auch
    // wartende Punkte umfasst.
    expect(expression).not.toContain(".result.ok");
    expect(expression).toContain(".result.scans.hara.ok");
    expect(expression).toContain(".result.scans.expansion.ok");
  });
  it("zeigt wartende Punkte in der Job-Zusammenfassung und im Abschlusslog", () => {
    expect(workflow).toContain("- Wartet auf: \\(.result.deferred | length)");
    expect(workflow).toContain("Punkt(e) warten auf Konfiguration oder Freigabe.");
  });
  it("behaelt den Schutz vor Rohdaten in Logs und Summary bei", () => {
    expect(workflow).not.toContain('cat "$body_file"');
    expect(workflow).not.toContain("TOKEN=");
    expect(workflow).toContain("Never echo raw response bodies");
  });
});

describe("Sprint 30: Vertrags-Gate meldet die Ursache im Klartext", () => {
  it("laesst einen vollstaendig gesunden Lauf durch", () => {
    if (!hasJq()) return; // jq fehlt lokal: die Struktur-Faelle oben decken das Gate ab.
    expect(evaluateGate(healthyRun)).toEqual([]);
  });

  it("akzeptiert einen ausgesetzten Scan nur, wenn er als wartend gemeldet ist", () => {
    if (!hasJq()) return;
    const waiting = {
      result: {
        ...healthyRun.result,
        scans: { hara: { ok: false }, expansion: { ok: true } },
        deferred: ["HARA-Live-Scan ausgesetzt: Relay nicht erreichbar (interne Revenue-Signale laufen weiter)"],
      },
    };
    expect(evaluateGate(waiting)).toEqual([]);

    // Verschwindet der Ausfall still, muss das Gate anschlagen.
    const silent = { result: { ...waiting.result, deferred: [] } };
    expect(evaluateGate(silent)).toEqual(["HARA-Scan weder ok noch als wartend gemeldet"]);
  });

  it("benennt echte Blockaden mit Ursache statt nur mit Zaehler", () => {
    if (!hasJq()) return;
    const blocked = { result: { ...healthyRun.result, blocked: ["Growth Pulse: Datenbank nicht erreichbar"] } };
    const problems = evaluateGate(blocked);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("echte Blockade(n)");
    expect(problems[0]).toContain("Datenbank nicht erreichbar");
  });

  it("behauptet bei fehlendem Growth Pulse keine Freigabe-Verletzung", () => {
    if (!hasJq()) return;
    const noPulse = {
      result: {
        scans: { hara: { ok: true }, expansion: { ok: true } },
        blocked: [],
        deferred: [],
        growth: { influencerPersonasLearned: 0, influencerExperimentsQueued: 0, b2bNodes: 0 },
      },
    };
    // Genau eine Ursache: der fehlende Puls. Keine erfundene Ausgabenfreigabe.
    expect(evaluateGate(noPulse)).toEqual(["Growth Pulse fehlt"]);
  });

  it("erkennt eine externe Aktion oder Freigabe als echte Verletzung", () => {
    if (!hasJq()) return;
    const unauthorized = {
      result: {
        ...healthyRun.result,
        growthPulse: {
          generated: 1,
          externalActionsExecuted: 2,
          plan: { spendingAuthorized: true, publishingAuthorized: false, priceChangesAuthorized: false },
        },
      },
    };
    const problems = evaluateGate(unauthorized);
    expect(problems).toContain("externe Aktion ohne Freigabe ausgefuehrt");
    expect(problems).toContain("Ausgaben ohne Freigabe erlaubt");
    expect(problems).not.toContain("Veroeffentlichung ohne Freigabe erlaubt");
  });

  it("bricht bei leerem Antwortkoerper nicht ab, sondern meldet fehlende Kennzahlen", () => {
    if (!hasJq()) return;
    const problems = evaluateGate({});
    expect(problems).toContain("Growth Pulse fehlt");
    expect(problems).toContain("Kennzahl b2bNodes fehlt");
    expect(problems.every(line => typeof line === "string" && line.length > 0)).toBe(true);
  });
});
