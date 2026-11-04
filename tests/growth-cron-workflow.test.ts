import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const workflow = readFileSync(".github/workflows/control-center-autopilot.yml", "utf8");
describe("Sprint 07: secure scheduled growth worker", () => {
  it("requires token-authenticated HTTPS and hides raw revenue data from logs", () => {
    expect(workflow).toContain('Authorization: Bearer $TOKEN');
    expect(workflow).toContain('case "$BASE_URL" in https://*');
    expect(workflow).not.toContain('cat "$body_file"');
    expect(workflow).toContain('jq -e');
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
  it("wertet die Gates ohne `.ok` aus, damit wartende Punkte den Job nicht kippen", () => {
    const gateLine = workflow
      .split("\n")
      .find(line => line.includes("jq -e ") && line.includes(".result.scans.hara.ok"));
    expect(gateLine).toBeDefined();
    // Geprueft werden die Einzelscans, nicht das globale `.ok`, das auch
    // wartende Punkte umfasst.
    expect(gateLine).not.toContain("jq -e '.ok");
    expect(gateLine).toContain("| length) == 0");
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
