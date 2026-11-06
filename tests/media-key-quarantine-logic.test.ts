import { describe, expect, it } from "vitest";

import {
  MEDIA_DEFAULT_COOLDOWN_MS,
  canStartMediaRun,
  classifyMediaFailure,
  initialKeyState,
  isKeyUsable,
  mediaKeyId,
  nextUsableKey,
  observeMediaAttempt,
  orderForAttempt,
  summarizeMediaKeys,
} from "../lib/media-key-quarantine-logic";

const NOW = 1_800_000_000_000;

function state(apiKey: string, source = "gemini") {
  return initialKeyState({ apiKey, source });
}

describe("classifyMediaFailure", () => {
  it("behandelt 401/402/403 als ungueltigen Schluessel", () => {
    expect(classifyMediaFailure(401)).toBe("invalid_key");
    expect(classifyMediaFailure(402)).toBe("invalid_key");
    expect(classifyMediaFailure(403)).toBe("invalid_key");
  });

  it("unterscheidet Kontingent, Serverfehler und Modellprobleme", () => {
    expect(classifyMediaFailure(429)).toBe("quota");
    expect(classifyMediaFailure(500)).toBe("transient");
    expect(classifyMediaFailure(503)).toBe("transient");
    expect(classifyMediaFailure(400)).toBe("bad_request");
    expect(classifyMediaFailure(404)).toBe("bad_request");
    expect(classifyMediaFailure(null)).toBe("transient");
  });
});

describe("mediaKeyId", () => {
  it("ist stabil und unterscheidet Schluessel", () => {
    expect(mediaKeyId("abc")).toBe(mediaKeyId("abc"));
    expect(mediaKeyId("abc")).not.toBe(mediaKeyId("abd"));
    expect(mediaKeyId("abc")).toMatch(/^k[0-9a-f]{8}$/);
  });
});

describe("observeMediaAttempt", () => {
  it("sperrt einen 401-Schluessel fuer den Rest des Laufs", () => {
    const after = observeMediaAttempt(state("key-a"), { status: 401, now: NOW });
    expect(after.quarantined).toBe(true);
    expect(after.lastFailure).toBe("invalid_key");
    expect(isKeyUsable(after, NOW + 60_000)).toBe(false);
  });

  it("setzt bei 429 einen Cooldown und gibt den Schluessel danach wieder frei", () => {
    const after = observeMediaAttempt(state("key-b"), { status: 429, now: NOW });
    expect(after.quarantined).toBe(false);
    expect(after.cooldownUntil).toBe(NOW + MEDIA_DEFAULT_COOLDOWN_MS.quota);
    expect(isKeyUsable(after, NOW)).toBe(false);
    expect(isKeyUsable(after, NOW + MEDIA_DEFAULT_COOLDOWN_MS.quota)).toBe(true);
  });

  it("respektiert Retry-After des Anbieters", () => {
    const after = observeMediaAttempt(state("key-c"), { status: 429, now: NOW, retryAfterSeconds: 5 });
    expect(after.cooldownUntil).toBe(NOW + 5_000);
  });

  it("zaehlt Erfolge und raeumt den Cooldown ab", () => {
    const cooling = observeMediaAttempt(state("key-d"), { status: 503, now: NOW });
    const after = observeMediaAttempt(cooling, { status: 200, now: NOW + 1_000 });
    expect(after.successes).toBe(1);
    expect(after.cooldownUntil).toBeNull();
    expect(after.lastFailure).toBeNull();
  });

  it("sperrt einen 400-Schluessel, ohne ihn als ungueltig zu bezeichnen", () => {
    const after = observeMediaAttempt(state("key-e"), { status: 400, now: NOW });
    expect(after.quarantined).toBe(true);
    expect(after.lastFailure).toBe("bad_request");
  });
});

describe("nextUsableKey und orderForAttempt", () => {
  it("ueberspringt tote Schluessel und nimmt den naechsten gesunden", () => {
    const dead = observeMediaAttempt(state("key-1"), { status: 401, now: NOW });
    const healthy = state("key-2");
    const picked = nextUsableKey([dead, healthy], NOW);
    expect(picked?.keyId).toBe(healthy.keyId);
  });

  it("gibt null zurueck, wenn kein Schluessel nutzbar ist", () => {
    const dead = observeMediaAttempt(state("key-3"), { status: 401, now: NOW });
    expect(nextUsableKey([dead], NOW)).toBeNull();
  });

  it("sortiert gesunde vor abgekuehlte Schluessel und laesst Quarantaene weg", () => {
    const dead = observeMediaAttempt(state("key-4"), { status: 401, now: NOW });
    const cooling = observeMediaAttempt(state("key-5"), { status: 429, now: NOW });
    const healthy = state("key-6");
    const order = orderForAttempt([dead, cooling, healthy], NOW);
    expect(order.map((entry) => entry.keyId)).toEqual([healthy.keyId, cooling.keyId]);
  });
});

describe("canStartMediaRun", () => {
  it("verweigert den Lauf ohne konfigurierten Schluessel", () => {
    const gate = canStartMediaRun([], NOW);
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toContain("Kein Media-Schluessel");
  });

  it("erlaubt den Lauf mit einem nutzbaren Schluessel", () => {
    expect(canStartMediaRun([state("key-7")], NOW).allowed).toBe(true);
  });

  it("verweigert den Lauf, wenn alle Schluessel tot oder im Cooldown sind", () => {
    const dead = observeMediaAttempt(state("key-8"), { status: 401, now: NOW });
    const cooling = observeMediaAttempt(state("key-9"), { status: 429, now: NOW });
    const gate = canStartMediaRun([dead, cooling], NOW);
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.reason).toContain("1 ungueltig");
      expect(gate.reason).toContain("1 im Cooldown");
    }
  });
});

describe("summarizeMediaKeys", () => {
  it("zaehlt Zustände und nennt die ungueltigen Quellen", () => {
    const dead = observeMediaAttempt(state("key-10", "gemini"), { status: 401, now: NOW });
    const cooling = observeMediaAttempt(state("key-11", "openai"), { status: 429, now: NOW });
    const healthy = observeMediaAttempt(state("key-12", "openai"), { status: 200, now: NOW });
    const summary = summarizeMediaKeys([dead, cooling, healthy]);
    expect(summary.keys).toBe(3);
    expect(summary.quarantined).toBe(1);
    expect(summary.cooling).toBe(1);
    expect(summary.successes).toBe(1);
    expect(summary.invalidSources).toEqual(["gemini"]);
  });
});
