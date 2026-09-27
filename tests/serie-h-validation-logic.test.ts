import { describe, it, expect } from "vitest";
import { validateSerieH } from "../lib/serie-h-validation-logic";

describe("Sprint 363 — Serie-H-Abschluss Logic", () => {
  it("validiert erfolgreich alle 10 Sprints der Serie H (354–363)", () => {
    const result = validateSerieH();

    expect(result.series).toBe("Serie H (Admin & Ops)");
    expect(result.totalSprints).toBe(10);
    expect(result.completedSprints).toBe(10);
    expect(result.isAllGreen).toBe(true);
    expect(result.sprints.length).toBe(10);

    const sprint359 = result.sprints.find((s) => s.sprint === 359);
    expect(sprint359).toBeDefined();
    expect(sprint359?.status).toBe("ok");

    const sprint360 = result.sprints.find((s) => s.sprint === 360);
    expect(sprint360).toBeDefined();
    expect(sprint360?.status).toBe("ok");

    const sprint361 = result.sprints.find((s) => s.sprint === 361);
    expect(sprint361).toBeDefined();
    expect(sprint361?.status).toBe("ok");

    const sprint362 = result.sprints.find((s) => s.sprint === 362);
    expect(sprint362).toBeDefined();
    expect(sprint362?.status).toBe("ok");

    const sprint363 = result.sprints.find((s) => s.sprint === 363);
    expect(sprint363).toBeDefined();
    expect(sprint363?.status).toBe("ok");

    expect(result.summary).toContain("100% GRÜN");
  });
});
