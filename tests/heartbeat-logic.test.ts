import { describe, expect, it } from "vitest";
import {
  buildHeartbeatCreateBody,
  buildHeartbeatUpdateBody,
  mapHeartbeatStatus,
  stringifyHeartbeatPayload,
  validateHeartbeatCron,
  validateHeartbeatPath,
  type HeartbeatJob,
  type HeartbeatJobUpdate,
} from "../lib/heartbeat-logic";

describe("stringifyHeartbeatPayload", () => {
  it("liefert {} fuer undefined und null", () => {
    expect(stringifyHeartbeatPayload(undefined)).toBe("{}");
    expect(stringifyHeartbeatPayload(null)).toBe("{}");
  });

  it("laesst Strings unangetastet und serialisiert Objekte", () => {
    expect(stringifyHeartbeatPayload('{"a":1}')).toBe('{"a":1}');
    expect(stringifyHeartbeatPayload({ sprint: 53 })).toBe('{"sprint":53}');
  });
});

describe("validateHeartbeatPath", () => {
  it("akzeptiert Pfade unter /api/scheduled/", () => {
    expect(validateHeartbeatPath("/api/scheduled/sync")).toEqual({ ok: true });
    expect(validateHeartbeatPath("/api/scheduled/nested/deep").ok).toBe(true);
  });

  it("lehnt leere und fremde Pfade ab", () => {
    expect(validateHeartbeatPath("").ok).toBe(false);
    expect(validateHeartbeatPath("/api/other").ok).toBe(false);
    expect(validateHeartbeatPath("api/scheduled/x").ok).toBe(false);
  });
});

describe("validateHeartbeatCron", () => {
  it("akzeptiert gueltige 6-Feld-Crons mit Sekundenfeld 0", () => {
    expect(validateHeartbeatCron("0 0 9 * * *")).toEqual({ ok: true });
    expect(validateHeartbeatCron("0 */2 * * * *").ok).toBe(true);
    expect(validateHeartbeatCron("0 30 4 1 * *").ok).toBe(true);
    expect(validateHeartbeatCron("0 0 9 * * 1-5").ok).toBe(true);
  });

  it("lehnt falsche Feldzahl und Sekunden != 0 ab", () => {
    expect(validateHeartbeatCron("0 9 * * *").ok).toBe(false); // 5 Felder
    expect(validateHeartbeatCron("0 0 9 * * * *").ok).toBe(false); // 7 Felder
    expect(validateHeartbeatCron("30 0 9 * * *").ok).toBe(false); // Intervall < 60s
  });

  it("lehnt ausserhalb des Bereichs liegende Zahlen und ungueltige Zeichen ab", () => {
    expect(validateHeartbeatCron("0 0 24 * * *").ok).toBe(false); // Stunde 24
    expect(validateHeartbeatCron("0 0 9 * * 7").ok).toBe(false); // Wochentag 7
    expect(validateHeartbeatCron("0 0 9 0 * *").ok).toBe(false); // Tag des Monats 0
    expect(validateHeartbeatCron("0 0 9 * * mon").ok).toBe(false); // Namen nicht erlaubt
    expect(validateHeartbeatCron("").ok).toBe(false);
  });
});

describe("buildHeartbeatCreateBody", () => {
  it("fuellt Defaults (POST, leere Beschreibung, Payload {})", () => {
    const job: HeartbeatJob = {
      name: "cybersarah-sync",
      cron: "0 0 * * * *",
      path: "/api/scheduled/sync",
    };
    expect(buildHeartbeatCreateBody(job)).toEqual({
      name: "cybersarah-sync",
      cronExpression: "0 0 * * * *",
      callbackPath: "/api/scheduled/sync",
      callbackMethod: "POST",
      callbackPayload: "{}",
      description: "",
    });
  });

  it("uebernimmt gesetzte Werte inkl. Payload-Serialisierung", () => {
    const job: HeartbeatJob = {
      name: "x",
      cron: "0 0 9 * * *",
      path: "/api/scheduled/x",
      method: "PUT",
      payload: { limit: 10 },
      description: "Tagesjobs",
    };
    expect(buildHeartbeatCreateBody(job)).toMatchObject({
      callbackMethod: "PUT",
      callbackPayload: '{"limit":10}',
      description: "Tagesjobs",
    });
  });
});

describe("buildHeartbeatUpdateBody", () => {
  it("enthaelt nur gesetzte Patch-Felder", () => {
    const patch: HeartbeatJobUpdate = { cron: "0 30 8 * * *" };
    expect(buildHeartbeatUpdateBody("task-1", patch)).toEqual({
      taskUid: "task-1",
      cronExpression: "0 30 8 * * *",
    });
  });

  it("uebersetzt enable, path, method und payload korrekt", () => {
    const patch: HeartbeatJobUpdate = {
      enable: false,
      path: "/api/scheduled/pause",
      method: "PUT",
      payload: '{"a":1}',
    };
    const body = buildHeartbeatUpdateBody("task-2", patch);
    expect(body).toEqual({
      taskUid: "task-2",
      callbackPath: "/api/scheduled/pause",
      callbackMethod: "PUT",
      callbackPayload: '{"a":1}',
      enable: false,
    });
  });
});

describe("mapHeartbeatStatus", () => {
  it("mappt alle bekannten HTTP-Status auf tRPC-Codes", () => {
    expect(mapHeartbeatStatus(401)).toBe("UNAUTHORIZED");
    expect(mapHeartbeatStatus(403)).toBe("FORBIDDEN");
    expect(mapHeartbeatStatus(404)).toBe("NOT_FOUND");
    expect(mapHeartbeatStatus(400)).toBe("BAD_REQUEST");
    expect(mapHeartbeatStatus(422)).toBe("BAD_REQUEST");
    expect(mapHeartbeatStatus(409)).toBe("CONFLICT");
    expect(mapHeartbeatStatus(429)).toBe("TOO_MANY_REQUESTS");
    expect(mapHeartbeatStatus(500)).toBe("INTERNAL_SERVER_ERROR");
  });
});
