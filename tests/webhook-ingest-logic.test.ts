import { describe, it, expect } from "vitest";
import {
  decideIngest,
  mapAllowedFields,
  isWithinReplayWindow,
  describeRejection,
  WEBHOOK_REPLAY_WINDOW_MS,
} from "@/lib/webhook-ingest-logic";

const endpoint = {
  id: "wh-1",
  userId: "u1",
  secret: "s3cret",
  allowedFields: ["event", "ref"],
};
const req = (over: Record<string, unknown> = {}) => ({
  endpointId: "wh-1",
  signatureHeader: "sig-ok",
  rawBody: "{}",
  receivedAt: 1000,
  ...over,
});

describe("Sprint 336 — Webhook-Eingang", () => {
  it("laesst nur registrierte Endpunkte mit gueltiger Signatur zu", () => {
    expect(decideIngest([endpoint], req(), "sig-ok").allowed).toBe(true);
    expect(decideIngest([], req(), "sig-ok").allowed).toBe(false);
    expect(decideIngest([endpoint], req({ endpointId: "nope" }), "sig-ok").allowed).toBe(false);
    expect(decideIngest([endpoint], req({ signatureHeader: null }), "sig-ok").allowed).toBe(false);
    const bad = decideIngest([endpoint], req({ signatureHeader: "sig-wrong" }), "sig-ok");
    expect(bad.allowed).toBe(false);
  });

  it("Ablehnungsgruende werden klar benannt", () => {
    expect(describeRejection("signatur ungueltig")).toContain("NICHT verarbeitet");
    expect(describeRejection("unbekannter endpunkt")).toContain("nicht registriert");
  });

  it("Feldfilter laesst nur erlaubte Felder durch", () => {
    const mapped = mapAllowedFields(endpoint, { event: "push", ref: "main", password: "x", internal: true });
    expect(mapped).toEqual({ event: "push", ref: "main" });
  });

  it("Replay-Fenster: alt und ohne Zeitstempel werden abgewiesen", () => {
    expect(WEBHOOK_REPLAY_WINDOW_MS).toBe(300_000);
    expect(isWithinReplayWindow(999_999, 1_000_000)).toBe(true);
    expect(isWithinReplayWindow(1_000_000 - WEBHOOK_REPLAY_WINDOW_MS - 1, 1_000_000)).toBe(false);
    expect(isWithinReplayWindow(null, 1_000_000)).toBe(false);
    expect(isWithinReplayWindow(1_000_001, 1_000_000)).toBe(false); // Zukunft: auch nein
  });
});
