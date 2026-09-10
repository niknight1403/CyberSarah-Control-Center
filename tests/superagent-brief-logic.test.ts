import { describe, expect, it } from "vitest";

import { BRIEF_MAX_ERRORS, buildSuperagentBrief, shouldAttachSuperagentBrief } from "../lib/superagent-brief-logic";

describe("superagent-brief-logic", () => {
  const input = {
    role: "admin",
    runtime: { state: "running", uptimeSeconds: 600, activeUrl: "https://app.cybersarah-ki.com", latencyMs: 45 },
    workspace: { connected: true, repositoryUrl: "https://github.com/niknight1403/cybersarah-revenue-os", branch: "main" },
    recentErrors: ["TypeError: Cannot read properties of undefined (reading 'id')", "Eine Warnung"],
    routeProvider: "anthropic",
    availableSkills: ["agent", "quality", "diff"],
    now: new Date("2026-09-10T12:00:00Z"),
  };

  it("baut ein vollstaendiges Briefing mit Live-Daten", () => {
    const brief = buildSuperagentBrief(input);
    expect(brief).toContain("[Superagent-Briefing 2026-09-10T12:00:00.000Z]");
    expect(brief).toContain("App-Status: running");
    expect(brief).toContain("Uptime 10 min");
    expect(brief).toContain("Latenz 45 ms");
    expect(brief).toContain("https://app.cybersarah-ki.com");
    expect(brief).toContain("Workspace: verbunden");
    expect(brief).toContain("cybersarah-revenue-os");
    expect(brief).toContain("Branch main");
    expect(brief).toContain("TypeError: Cannot read properties");
    expect(brief).toContain('Modell-Route: Dieser Auftrag läuft über "anthropic"');
    expect(brief).toContain("agent, quality, diff");
  });

  it("weist auf fehlenden Workspace hin und meldet fehlerfreie Logs", () => {
    const brief = buildSuperagentBrief({ ...input, workspace: null, recentErrors: [] });
    expect(brief).toContain("Workspace: nicht verbunden");
    expect(brief).toContain("Laufzeitfehler: keine");
  });

  it("begrenzt die Fehlerliste auf das Kontingent", () => {
    const brief = buildSuperagentBrief({
      ...input,
      recentErrors: Array.from({ length: 12 }, (_, index) => `Fehler ${index}`),
    });
    expect(brief).toContain(`Fehler ${BRIEF_MAX_ERRORS - 1}`);
    expect(brief).not.toContain(`Fehler ${BRIEF_MAX_ERRORS}`);
  });

  it("kuerzt ueberlange Fehlerzeilen", () => {
    const brief = buildSuperagentBrief({ ...input, recentErrors: ["x".repeat(600)] });
    expect(brief).not.toContain("x".repeat(301));
  });

  it("aktiviert das Briefing nur fuer Admin-Systemauftraege", () => {
    expect(shouldAttachSuperagentBrief("Führe einen System-Audit durch", "admin")).toBe(true);
    expect(shouldAttachSuperagentBrief("Zeig mir die Logs", "admin")).toBe(true);
    expect(shouldAttachSuperagentBrief("Hallo, wie geht es dir?", "admin")).toBe(false);
    expect(shouldAttachSuperagentBrief("Führe einen System-Audit durch", "user")).toBe(false);
  });
});
