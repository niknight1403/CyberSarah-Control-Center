import { describe, expect, it } from "vitest";

import {
  AI_AGENTEN,
  AI_AGENTEN_TYPEN,
  AUFGABE_TYPEN,
  agentFuerAufgabe,
  baueIdempotenzKey,
  darfAufgabeWechseln,
  findAgent,
  findAufgabeTyp,
  istFreigabeGueltig,
  statusNachAusfuehrung,
  waehleNaechsteAufgabe,
  type QueueKandidat,
} from "../../lib/ai-influenza-orchestrator-logic";

const kand = (over: Partial<QueueKandidat>): QueueKandidat => ({
  id: 1,
  aufgabeTyp: "marktanalyse",
  status: "queued",
  prioritaet: 50,
  versuche: 0,
  maxVersuche: 3,
  erstelltAmMs: 1000,
  ...over,
});

describe("Agenten-Team (8 Rollen)", () => {
  it("enthält genau die acht Master-Prompt-Rollen", () => {
    expect(AI_AGENTEN).toHaveLength(8);
    expect([...AI_AGENTEN_TYPEN]).toEqual([
      "ceo",
      "market_intelligence",
      "lead_discovery",
      "sales_conversion",
      "content_production",
      "video_creative",
      "customer_success",
      "profit_optimizer",
    ]);
    expect(Object.isFrozen(AI_AGENTEN)).toBe(true);
  });

  it("jede Rolle hat Name und Beschreibung", () => {
    for (const agent of AI_AGENTEN) {
      expect(agent.name.length).toBeGreaterThan(3);
      expect(agent.rolle.length).toBeGreaterThan(20);
    }
    expect(findAgent("ceo")?.name).toContain("CEO");
    expect(findAgent("gibt-es-nicht")).toBeUndefined();
  });
});

describe("Aufgaben-Routing", () => {
  it("jeder Aufgabentyp hat einen existierenden Agenten", () => {
    for (const typ of AUFGABE_TYPEN) {
      expect(findAgent(typ.agentTyp)).toBeDefined();
    }
  });

  it("routet Kernaufgaben korrekt", () => {
    expect(agentFuerAufgabe("angebot_entwurf")).toBe("sales_conversion");
    expect(agentFuerAufgabe("marktanalyse")).toBe("market_intelligence");
    expect(agentFuerAufgabe("lead_recherche")).toBe("lead_discovery");
    expect(agentFuerAufgabe("video_skript")).toBe("video_creative");
    expect(agentFuerAufgabe("profit_analyse")).toBe("profit_optimizer");
    expect(agentFuerAufgabe("unbekannt")).toBeUndefined();
  });

  it("Revenue-First: Angebotsentwurf priorisiert vor Content", () => {
    const angebot = findAufgabeTyp("angebot_entwurf")!;
    const content = findAufgabeTyp("content_erstellen")!;
    expect(angebot.prioritaet).toBeGreaterThan(content.prioritaet);
    expect(findAufgabeTyp("lead_recherche")!.prioritaet).toBeGreaterThan(content.prioritaet);
  });

  it("externe Wirkung ist freigabepflichtig, interne Analyse nicht", () => {
    expect(findAufgabeTyp("angebot_entwurf")!.freigabePflichtig).toBe(true);
    expect(findAufgabeTyp("content_erstellen")!.freigabePflichtig).toBe(true);
    expect(findAufgabeTyp("marktanalyse")!.freigabePflichtig).toBe(false);
    expect(findAufgabeTyp("profit_analyse")!.freigabePflichtig).toBe(false);
  });
});

describe("Statusmaschine", () => {
  it("erlaubt Standardpfad und Wiederholung nach Fehler", () => {
    expect(darfAufgabeWechseln("queued", "running")).toBe(true);
    expect(darfAufgabeWechseln("running", "freigabe_offen")).toBe(true);
    expect(darfAufgabeWechseln("freigabe_offen", "erledigt")).toBe(true);
    expect(darfAufgabeWechseln("fehlgeschlagen", "queued")).toBe(true);
  });

  it("verhindert Endlos-Loops aus Endzuständen", () => {
    expect(darfAufgabeWechseln("erledigt", "running")).toBe(false);
    expect(darfAufgabeWechseln("abgebrochen", "queued")).toBe(false);
  });

  it("setzt Entwürfe auf freigabe_offen, Analysen direkt auf erledigt", () => {
    expect(statusNachAusfuehrung("angebot_entwurf")).toBe("freigabe_offen");
    expect(statusNachAusfuehrung("marktanalyse")).toBe("erledigt");
    expect(statusNachAusfuehrung("unbekannt")).toBe("erledigt");
  });
});

describe("Queue-Auswahl", () => {
  it("wählt höchste Priorität, bei Gleichstand die älteste", () => {
    const next = waehleNaechsteAufgabe([
      kand({ id: 1, prioritaet: 50, erstelltAmMs: 2000 }),
      kand({ id: 2, prioritaet: 95, erstelltAmMs: 3000 }),
      kand({ id: 3, prioritaet: 95, erstelltAmMs: 1500 }),
    ]);
    expect(next?.id).toBe(3);
  });

  it("ignoriert nicht-lauffähige und erschöpfte Aufgaben", () => {
    const next = waehleNaechsteAufgabe([
      kand({ id: 1, status: "running" }),
      kand({ id: 2, status: "erledigt" }),
      kand({ id: 3, versuche: 3, maxVersuche: 3 }),
      kand({ id: 4, status: "queued", prioritaet: 10 }),
    ]);
    expect(next?.id).toBe(4);
  });

  it("liefert undefined bei leerer Queue", () => {
    expect(waehleNaechsteAufgabe([])).toBeUndefined();
  });
});

describe("Idempotenz und Freigabe", () => {
  it("erzeugt stabile Schlüssel unabhängig von der Feldreihenfolge", () => {
    const a = baueIdempotenzKey("marktanalyse", { nische: "ki", region: "dach" });
    const b = baueIdempotenzKey("marktanalyse", { region: "dach", nische: "ki" });
    const c = baueIdempotenzKey("marktanalyse", { nische: "saas" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith("marktanalyse:")).toBe(true);
  });

  it("Freigabe nur aus freigabe_offen und nur mit Freigeber", () => {
    expect(istFreigabeGueltig("freigabe_offen", "admin")).toBe(true);
    expect(istFreigabeGueltig("freigabe_offen", "  ")).toBe(false);
    expect(istFreigabeGueltig("running", "admin")).toBe(false);
    expect(istFreigabeGueltig("freigabe_offen", null)).toBe(false);
  });
});
