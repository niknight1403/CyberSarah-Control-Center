import { describe, it, expect } from "vitest";
import {
  validateEvent,
  eventsInWindow,
  findConflicts,
  toProviderPayload,
  describeReadResult,
} from "@/lib/calendar-integration-logic";

const ev = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  title: "Termin",
  startsAt: 1000,
  endsAt: 2000,
  location: null,
  attendees: [],
  ...over,
});

describe("Sprint 335 — Kalender-Integration", () => {
  it("validiert: Ende nach Start, Titel und ID Pflicht", () => {
    expect(validateEvent(ev()).ok).toBe(true);
    expect(validateEvent(ev({ endsAt: 1000 })).issues).toContain("Ende liegt nicht nach Start");
    expect(validateEvent(ev({ title: " " })).issues).toContain("Titel fehlt");
  });

  it("filtert Zeitfenster inklusive Raender und sortiert", () => {
    const list = [ev({ id: "b", startsAt: 200, endsAt: 300 }), ev({ id: "a", startsAt: 100, endsAt: 150 })];
    const inWindow = eventsInWindow(list, 100, 300);
    expect(inWindow.map((e) => e.id)).toEqual(["a", "b"]);
    expect(eventsInWindow(list, 301, 400)).toHaveLength(0);
  });

  it("findet echte Ueberschneidungen, keine Pseudo-Konflikte", () => {
    const existing = [ev({ id: "x", startsAt: 100, endsAt: 200 })];
    expect(findConflicts(existing, ev({ startsAt: 150, endsAt: 250 })).map((e) => e.id)).toEqual(["x"]);
    expect(findConflicts(existing, ev({ startsAt: 200, endsAt: 300 }))).toHaveLength(0);
  });

  it("formt Provider-Payloads je Anbieter aus denselben Daten", () => {
    const g = toProviderPayload(ev(), "google") as Record<string, any>;
    expect(g.start.dateTime).toContain("T");
    expect(g.attendees).toEqual([]);
    const o = toProviderPayload(ev(), "outlook") as Record<string, any>;
    expect(o.start.timeZone).toBe("UTC");
    const i = toProviderPayload(ev(), "ical") as Record<string, any>;
    expect(i).toHaveProperty("dtSTART");
  });

  it("Lese-Fehler bleibt Fehler, leeres Fenster bleibt leer", () => {
    expect(describeReadResult({ ok: true, events: [] })).toContain("Kein Termin");
    expect(describeReadResult({ ok: false, error: "401" })).toContain("FEHLGESCHLAGEN");
  });
});
