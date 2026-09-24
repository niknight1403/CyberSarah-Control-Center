import { describe, it, expect } from "vitest";
import {
  defaultToolRegistry,
  routeToolRequest,
  describeTools,
  coveredIntents,
} from "@/lib/agent-tool-router-logic";

const allExtern = { "bild-generierung": true, "web-suche": true, browser: true, transkription: true } as const;

describe("Paritaet 4/6 — Tool-Router", () => {
  it("lokale Tools sind immer gratis verfuegbar, externe nur mit Anbindung", () => {
    const bare = defaultToolRegistry({});
    const local = routeToolRequest(bare, { intent: "suche-im-code" });
    expect(local.ok).toBe(true);
    const web = routeToolRequest(bare, { intent: "im-web-suchen" });
    expect(web.ok).toBe(false);
    if (!web.ok) expect(web.reason).toBe("nicht konfiguriert");
    const full = routeToolRequest(defaultToolRegistry(allExtern), { intent: "im-web-suchen" });
    expect(full.ok).toBe(true);
  });

  it("jeder Intent mappt auf sein Tool — keine Fakes", () => {
    const tools = defaultToolRegistry(allExtern);
    const intents: Parameters<typeof routeToolRequest>[1]["intent"][] = [
      "suche-im-code", "datei-lesen-schreiben", "daten-speichern", "bild-erzeugen",
      "im-web-suchen", "seite-oeffnen", "audio-verstehen",
    ];
    for (const intent of intents) {
      const r = routeToolRequest(tools, { intent });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.cost).toBe("gratis");
    }
  });

  it("Abdeckung zaehlt nur ERNST bedienbare Intents", () => {
    const bare = coveredIntents(defaultToolRegistry({}));
    expect(bare).toContain("suche-im-code");
    expect(bare).not.toContain("im-web-suchen");
    const full = coveredIntents(defaultToolRegistry(allExtern));
    expect(full).toHaveLength(7);
  });

  it("Uebersicht markiert unkonfigurierte Tools ehrlich", () => {
    const text = describeTools(defaultToolRegistry({}));
    expect(text).toContain("(lokal, gratis)");
    expect(text).toContain("NICHT konfiguriert — ehrlich abwesend");
  });
});
