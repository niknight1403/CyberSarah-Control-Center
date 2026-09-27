import { describe, it, expect } from "vitest";
import {
  matchPattern,
  recordOutcome,
  decideNextStep,
  formatHealLogLine,
  SELF_HEAL_MAX_ATTEMPTS,
} from "@/lib/self-healing-patterns-logic";
import type { SelfHealAttemptState } from "@/lib/self-healing-patterns-logic";

describe("Sprint 329 — Selbstheilung", () => {
  it("erkennt bekannte Muster, ratet nie", () => {
    expect(matchPattern("Error: ECONNREFUSED 127.0.0.1:5432")?.action).toBe("reconnect-db");
    expect(matchPattern("Warning: stale cache detected")?.action).toBe("rebuild-cache");
    expect(matchPattern("HTTP 503 upstream unavailable")?.action).toBe("retry-request");
    expect(matchPattern("gar nichts davon")).toBeNull();
  });

  it("heilt weiter bis zur Versuchsgrenze, eskaliert dann ehrlich", () => {
    let state: SelfHealAttemptState = { patternId: "db-connection-lost", outcomes: [] };
    state = recordOutcome(state, { ok: false, at: 1, detail: "nope" });
    expect(decideNextStep(state).step).toBe("heilen");
    state = recordOutcome(state, { ok: false, at: 2, detail: "nope" });
    expect(decideNextStep(state).step).toBe("heilen");
    state = recordOutcome(state, { ok: false, at: 3, detail: "nope" });
    const esc = decideNextStep(state);
    expect(esc.step).toBe("eskalieren");
    expect(esc.reason).toContain("Mensch muss rein");
    expect(SELF_HEAL_MAX_ATTEMPTS).toBe(3);
  });

  it("Erfolg beendet die Heilung mit Fehlversuchs-Zahl", () => {
    let state: SelfHealAttemptState = { patternId: "cache-stale", outcomes: [] };
    state = recordOutcome(state, { ok: false, at: 1, detail: "" });
    state = recordOutcome(state, { ok: true, at: 2, detail: "" });
    const d = decideNextStep(state);
    expect(d.step).toBe("warten");
    expect(d.reason).toContain("1 Fehlversuch");
  });

  it("jeder Heilversuch erzeugt eine sichtbare Log-Zeile", () => {
    const p = matchPattern("ECONNREFUSED")!;
    const line = formatHealLogLine(p, 1, false, 0);
    expect(line).toContain("[self-heal]");
    expect(line).toContain("FEHLGESCHLAGEN");
    expect(formatHealLogLine(p, 2, true, 0)).toContain("ERFOLGREICH");
  });
});
