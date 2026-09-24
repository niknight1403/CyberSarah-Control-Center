import { describe, expect, it } from "vitest";

import {
  createLoopDraft,
  loopProgressPercent,
  loopStatusLabel,
  LOOP_DISCLAIMER,
  validateLoopDraft,
  type LoopDraft,
} from "../lib/revenue-loop-logic";

const VALID: Partial<LoopDraft> = {
  name: "Content-to-Lead",
  flow: "Content → Lead",
  hypothesis: "Kurze YouTube-Shorts führen pro Woche zu Newsletter-Anmeldungen.",
  experiment: "4 Wochen je 3 Shorts mit identischem CTA, Zähler im Newsletter-Tool.",
  metric: "Newsletter-Anmeldungen",
  unit: "Anmeldungen",
  targetValue: 100,
  currentValue: 0,
};

describe("revenue loop core (Sprint 222)", () => {
  it("erzeugt einen normalisierten Entwurf im Status draft", () => {
    const loop = createLoopDraft(VALID, () => 1_000);
    expect(loop.id).toBe("loop-rs"); // 1000 = "rs" in base36
    expect(loop.status).toBe("draft");
    expect(loop.samples).toEqual([]);
    expect(loop.createdAt).toBe(1_000);
    expect(loop.name).toBe("Content-to-Lead");
  });

  it("lehnt unvollständige und unsinnige Entwürfe mit Grund ab", () => {
    expect(validateLoopDraft({ ...VALID, name: "ab" }).reason).toContain("Name");
    expect(validateLoopDraft({ ...VALID, hypothesis: "kurz" }).reason).toContain("Hypothese");
    expect(validateLoopDraft({ ...VALID, targetValue: 0 }).reason).toContain("Ziel");
    expect(validateLoopDraft({ ...VALID, currentValue: -3 }).reason).toContain("aktuelle Wert");
    expect(validateLoopDraft({ ...VALID, unit: " " }).reason).toContain("Einheit");
    expect(createLoopDraft).toThrow();
  });

  it("beschreibt Status ehrlich und klemmt den Fortschritt", () => {
    expect(loopStatusLabel("draft")).toBe("Entwurf");
    expect(loopStatusLabel("stalled")).toBe("Steckengeblieben");
    const loop = createLoopDraft({ ...VALID, currentValue: 150 });
    expect(loopProgressPercent(loop)).toBe(100);
    expect(loopProgressPercent({ ...loop, currentValue: 25, targetValue: 200 })).toBeCloseTo(12.5, 10);
    expect(loopProgressPercent({ ...loop, targetValue: 0 })).toBe(0);
    expect(LOOP_DISCLAIMER).toContain("keine Umsatzgarantie");
  });
});
