/**
 * Finalisierung des Autopilot-Katalogs: jeder Eintrag behauptet eine
 * Verdrahtung. Dieser Test vergleicht die Behauptung mit dem Repo —
 * Workflow-Datei, Cron-Ausdruck, Timer oder Aufrufstelle.
 *
 * Damit kann der Katalog nicht veralten, ohne dass die Suite rot wird:
 * genau der Fehler, der beim Deploy-Trigger schon einmal passiert ist
 * (Workflow-Name passte nicht zur Realitaet).
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AUTOPILOTS, buildAutopilotOverview, validateAutopilotCatalog } from "../lib/autopilot-registry-logic";

const WURZEL = path.resolve(__dirname, "..");

function lies(relativ: string): string {
  return fs.readFileSync(path.join(WURZEL, relativ), "utf8");
}

describe("Autopilot-Katalog: Verdrahtung", () => {
  it("ist regelkonform", () => {
    expect(validateAutopilotCatalog()).toEqual([]);
  });

  it("hat fuer jeden Eintrag eine existierende Referenz", () => {
    for (const entry of AUTOPILOTS) {
      // Kind-Laeufe zeigen auf ihren Dachlauf, nicht auf eine Datei; dass der
      // parent existiert, prueft validateAutopilotCatalog.
      if (entry.trigger.kind === "parent") continue;
      const ref = entry.trigger.ref;
      const pfad = path.join(WURZEL, ref);
      expect(fs.existsSync(pfad), `${entry.id}: ${ref} fehlt`).toBe(true);
    }
  });

  it("nennt fuer Cron-Laeufe den Cron-Ausdruck, der wirklich im Workflow steht", () => {
    const cronEintraege = AUTOPILOTS.filter((entry) => entry.trigger.kind === "cron");
    expect(cronEintraege.length).toBeGreaterThanOrEqual(4);
    for (const entry of cronEintraege) {
      const inhalt = lies(entry.trigger.ref);
      expect(inhalt, `${entry.id}: ${entry.trigger.ref} ist kein Workflow`).toMatch(/^name:/m);
      expect(inhalt, `${entry.id}: Cron ${entry.trigger.cron} nicht im Workflow`).toContain(
        `"${entry.trigger.cron}"`,
      );
    }
  });

  it("belegt Timer-Laeufe mit einem echten setInterval im Server", () => {
    for (const entry of AUTOPILOTS.filter((eintrag) => eintrag.trigger.kind === "timer")) {
      const inhalt = lies(entry.trigger.ref);
      expect(inhalt, `${entry.id}: kein Timer in ${entry.trigger.ref}`).toContain("setInterval");
      expect(inhalt, `${entry.id}: Timer startet nicht selbst`).toContain("start");
    }
  });

  it("belegt Route-Laeufe mit einer echten Aufrufstelle", () => {
    for (const entry of AUTOPILOTS.filter((eintrag) => eintrag.trigger.kind === "route")) {
      const inhalt = lies(entry.trigger.ref);
      expect(inhalt.length, `${entry.id}: ${entry.trigger.ref} ist leer`).toBeGreaterThan(100);
      if (entry.trigger.ref.endsWith("index.ts")) {
        expect(inhalt).toMatch(/router|app\.(get|post|use)/);
      } else {
        expect(inhalt).toMatch(/export (const|function)/);
      }
    }
  });

  it("haengt Discovery und Hub-Entwuerfe unter den Dachlauf", () => {
    const overview = buildAutopilotOverview();
    expect(overview.children["control-center"]).toEqual(
      expect.arrayContaining(["hub-drafts", "revenue-discovery"]),
    );
  });

  it("beschreibt keine Kind-Laeufe, die im Dachlauf fehlen", () => {
    const dachlauf = lies(".github/workflows/control-center-autopilot.yml");
    const serverDatei = lies("server/control-center-autopilot.ts");
    expect(dachlauf).toContain("/api/cron/control-center-autopilot");
    for (const id of ["hubDraftRunner", "discoveryRunner"]) {
      expect(serverDatei, `${id} fehlt im Dachlauf`).toContain(id);
    }
  });

  it("meldet Verstoesse, statt sie zu dulden", () => {
    const kaputt = [
      {
        ...AUTOPILOTS[0],
        id: "test-aktiv-ohne-gate",
        gates: [],
        trigger: { kind: "cron" as const, ref: "package.json", cron: "0 0 * * *" },
      },
      { ...AUTOPILOTS[0], id: "test-ohne-referenz", trigger: { kind: "manual" as const, ref: "" } },
      { ...AUTOPILOTS[0], id: "test-empfohlen-ohne-voraussetzung", status: "recommended" as const, prerequisite: undefined },
      { ...AUTOPILOTS[0], id: "test-kind-ohne-parent", trigger: { kind: "parent" as const, ref: "x" }, parent: undefined },
    ];
    const probleme = validateAutopilotCatalog(kaputt).map((eintrag) => eintrag.problem);
    expect(probleme).toContain("aktiv, aber ohne Gate");
    expect(probleme).toContain("ohne Trigger-Referenz");
    expect(probleme).toContain("empfohlen, aber ohne Voraussetzung");
    expect(probleme).toContain("Kind-Lauf ohne parent");
  });
});

describe("Autopilot-Katalog: Uebersicht", () => {
  it("zaehlt die Laeufe und nennt die naechste Voraussetzung", () => {
    const overview = buildAutopilotOverview();
    expect(overview.summary.active).toBeGreaterThanOrEqual(6);
    expect(overview.summary.recommended).toBeGreaterThanOrEqual(1);
    expect(overview.summary.notUseful).toBeGreaterThanOrEqual(1);
    expect(overview.issues).toEqual([]);
    // Der naechste Schritt muss eine konkrete Voraussetzung nennen, keine Floskel.
    expect(overview.nextSensibleStep).toMatch(/Digistore24|Alarmkanal/);
  });

  it("kennzeichnet bewusst abgelehnte Automatik mit Begruendung", () => {
    const preis = AUTOPILOTS.find((entry) => entry.id === "price-tuning");
    expect(preis?.status).toBe("not-useful");
    expect(preis?.rationale.length).toBeGreaterThan(60);
  });
});
