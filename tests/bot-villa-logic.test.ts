import { describe, expect, it } from "vitest";

import {
  CORE_TEAM_SIZE,
  LIVE_WORKER_CAP,
  MAX_VILLA_WORKERS,
  SPECIALTY_CATALOG,
  buildVillaBlueprint,
  planWorkerSpawn,
  validateVillaBlueprint,
} from "@/lib/bot-villa-logic";

describe("bot villa logic (Sprint 364)", () => {
  it("baut ein Kern-Team von 8 Live-Workern je Projektart", () => {
    for (const kind of ["web-app", "saas", "content"] as const) {
      const villa = buildVillaBlueprint(kind);
      expect(villa.coreTeam).toHaveLength(CORE_TEAM_SIZE);
      expect(villa.coreTeam.every((worker) => worker.tier === "kern")).toBe(true);
    }
  });

  it("verteilt den Pool gewichtet und bleibt unter der Kapazitaet von 5000", () => {
    const villa = buildVillaBlueprint("saas");
    expect(villa.coreTeam.length + villa.pool.length).toBeLessThanOrEqual(MAX_VILLA_WORKERS);
    expect(villa.pool.length).toBeGreaterThan(0);
    const specialties = new Set(villa.pool.map((worker) => worker.specialty));
    expect(specialties.size).toBeLessThanOrEqual(SPECIALTY_CATALOG.length);
  });

  it("validiert Invarianten und meldet Verstoesse praediktabel", () => {
    const valid = buildVillaBlueprint("web-app");
    expect(validateVillaBlueprint(valid)).toEqual([]);

    const broken = { ...valid, coreTeam: valid.coreTeam.slice(0, 4) };
    expect(validateVillaBlueprint(broken)[0]).toContain("Kern-Team");
  });

  it("spawnt passende Pool-Worker on demand und niemals mehr als das Cap", () => {
    const villa = buildVillaBlueprint("web-app");
    const spawn = planWorkerSpawn(villa, "Endpoint fuer api-service bauen");
    expect(spawn.workers.length).toBeGreaterThan(0);
    expect(spawn.workers.every((worker) => worker.tier === "pool")).toBe(true);
    expect(spawn.workers.length).toBeLessThanOrEqual(LIVE_WORKER_CAP);

    const empty = planWorkerSpawn(villa, "xyzzy-nicht-matching");
    expect(empty.workers).toEqual([]);
    expect(empty.note).toContain("Kein Pool-Worker");
  });
});
