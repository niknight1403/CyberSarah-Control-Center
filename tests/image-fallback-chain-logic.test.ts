/**
 * Sprint 308 — Tests fuer die Bild-Fallback-Kette FLUX -> Gradient.
 */
import { describe, it, expect } from "vitest";
import {
  attemptBudgetLeft,
  resolveSceneImage,
  formatResultLabel,
  formatAttemptLog,
  summarizeImageSources,
  IMAGE_FALLBACK,
} from "@/lib/image-fallback-chain-logic";

describe("Sprint 308 — Image Fallback Chain Logic", () => {
  it("laesst max 2 Versuche pro Anbieter zu", () => {
    expect(attemptBudgetLeft([])).toBe(true);
    expect(attemptBudgetLeft([{ provider: "flux", success: false }])).toBe(true);
    expect(attemptBudgetLeft([
      { provider: "flux", success: false },
      { provider: "flux", success: false, reason: "timeout" },
    ])).toBe(false);
  });

  it("erkennt generierte Bilder nur bei letztem erfolgreichen Versuch", () => {
    const r = resolveSceneImage([{ provider: "flux", success: true }], "g1", "https://cdn/x.png");
    expect(r.source).toBe("generated");
  });

  it("faellt ehrlich auf Gradient zurueck und nennt den Grund", () => {
    const r = resolveSceneImage(
      [{ provider: "flux", success: false, reason: "rate limit" }],
      "g1",
      null,
    );
    expect(r.source).toBe("gradient-fallback");
    if (r.source === "gradient-fallback") {
      expect(r.reason).toContain("rate limit");
      expect(r.gradientKey).toBe("g1");
    }
  });

  it("meldet fehlende Versuche ehrlich (kein Fake-Bild)", () => {
    const r = resolveSceneImage([], "g1", null);
    expect(r.source).toBe("gradient-fallback");
    if (r.source === "gradient-fallback") {
      expect(r.reason).toContain("Kein Generierungsversuch");
    }
  });

  it("Gradient wird NIE als generiertes Bild deklariert", () => {
    const label = formatResultLabel(
      resolveSceneImage([{ provider: "flux", success: false }], "g1", null),
    );
    expect(label).toContain("Ersatz-Gradient");
    expect(label).not.toContain("generiert");
    expect(formatResultLabel(
      resolveSceneImage([{ provider: "flux", success: true }], "g1", "u"),
    )).toContain("FLUX-Bild");
  });

  it("formatAttemptLog listet Versuche mit Nummer und Grund", () => {
    const lines = formatAttemptLog([
      { provider: "flux", success: false, reason: "timeout" },
      { provider: "flux", success: true },
    ]);
    expect(lines[0]).toContain("Versuch 1");
    expect(lines[0]).toContain("timeout");
    expect(lines[1]).toContain("erfolgreich");
  });

  it("summarizeImageSources zaehlt ehrlich nur wenn Quellen stimmen", () => {
    const results = [
      resolveSceneImage([{ provider: "flux", success: true }], "g", "u"),
      resolveSceneImage([{ provider: "flux", success: false }], "g", null),
    ];
    const s = summarizeImageSources(results);
    expect(s.generated).toBe(1);
    expect(s.gradientFallback).toBe(1);
    expect(s.honest).toBe(true);
    expect(IMAGE_FALLBACK.providers).toContain("flux");
  });
});
