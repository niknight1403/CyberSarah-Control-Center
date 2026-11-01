import { describe, expect, it } from "vitest";
import {
  classifyPublishingFailure,
  groupPublishingFailures,
  type PublishingFailureJob,
} from "../lib/publishing-failure-reasons-logic";

// Schluesselartige Testtexte zur Laufzeit bilden (Gitleaks-Gate).
const fakeKey = ["sk", "live", "abcdef123456"].join("_");

const job = (over: Partial<PublishingFailureJob>): PublishingFailureJob => ({
  platform: "linkedin",
  status: "fehlgeschlagen",
  attempts: 1,
  lastError: null,
  ...over,
});

describe("Sprint 44 – Publikationsfehler nach Ursache und Provider", () => {
  it("ordnet Fehlertexte den Ursachen zu, ohne Versand-unklar als retrybar zu markieren", () => {
    expect(classifyPublishingFailure("401 Unauthorized: token invalid").cause).toBe("auth");
    expect(classifyPublishingFailure("429 Too Many Requests").retryable).toBe(true);
    expect(classifyPublishingFailure("Quota exceeded for this plan").cause).toBe("quota");
    expect(classifyPublishingFailure("Video format unsupported").cause).toBe("media_rejected");
    expect(classifyPublishingFailure("Blocked by community guidelines").cause).toBe("policy_rejected");
    expect(classifyPublishingFailure("fetch failed: ECONNRESET").retryable).toBe(true);
    const unclear = classifyPublishingFailure("Quarantaene: Provider quittierte, DB-Bestätigung blieb aus.");
    expect(unclear.cause).toBe("provider_unconfirmed");
    expect(unclear.retryable).toBe(false);
  });

  it("behandelt fehlende Fehlertexte ehrlich als unbekannt statt als Erfolg", () => {
    const report = groupPublishingFailures([job({ platform: "x", lastError: null })]);
    expect(report.totalFailedJobs).toBe(1);
    expect(report.withErrorText).toBe(0);
    expect(report.withoutErrorText).toBe(1);
    expect(report.byCause[0]).toMatchObject({ cause: "unknown", count: 1, platforms: ["x"] });
    expect(report.manualReview).toBe(1);
    expect(report.retryable).toBe(0);
  });

  it("trennt Fehlergruende je Provider und nennt die haeufigste Ursache", () => {
    const report = groupPublishingFailures([
      job({ platform: "instagram", lastError: "429 too many requests" }),
      job({ platform: "instagram", lastError: "media format unsupported" }),
      job({ platform: "linkedin", lastError: "401 unauthorized" }),
      job({ platform: "linkedin", status: "versand_ungeklaert", lastError: "Versand ungeklaert" }),
    ]);
    expect(report.byPlatform.map(p => p.platform)).toEqual(["instagram", "linkedin"]);
    expect(report.byPlatform[0]).toMatchObject({ platform: "instagram", failures: 2, retryable: 1, manualReview: 1 });
    expect(report.byPlatform[1]).toMatchObject({ platform: "linkedin", failures: 2, retryable: 0, manualReview: 2 });
    expect(report.byPlatform[1]!.topCause).toBe("auth");
  });

  it("ignoriert erfolgreiche und geplante Jobs vollstaendig", () => {
    const report = groupPublishingFailures([
      job({ status: "veroeffentlicht", lastError: null }),
      job({ status: "geplant", lastError: null }),
      job({ status: "in_bearbeitung", lastError: "429" }),
    ]);
    expect(report.totalFailedJobs).toBe(0);
    expect(report.byPlatform).toEqual([]);
    expect(report.byCause).toEqual([]);
    expect(report.note).toContain("Keine fehlgeschlagenen");
  });

  it("maskiert Geheimnisse und personenbezogene Daten im angezeigten Fehlertext", () => {
    const report = groupPublishingFailures([
      job({ platform: "x", lastError: `Fehler fuer niko@example.com mit ${fakeKey}` }),
    ]);
    const shown = report.byPlatform[0]!.lastError!;
    expect(shown).not.toContain("niko@example.com");
    expect(shown).not.toContain(fakeKey);
    expect(shown).toContain("[email]");
  });

  it("zaehlt manuelle Pruefung fuer nicht-retrybare Ursachen und Versand-unklar", () => {
    const report = groupPublishingFailures([
      job({ lastError: "401 unauthorized" }),
      job({ status: "versand_ungeklaert", lastError: "Versand ungeklaert" }),
      job({ lastError: "timeout" }),
    ]);
    expect(report.totalFailedJobs).toBe(3);
    expect(report.retryable).toBe(1);
    expect(report.manualReview).toBe(2);
  });

  it("liefert fuer leere Eingabe einen leeren, ehrlichen Bericht", () => {
    const report = groupPublishingFailures([]);
    expect(report).toMatchObject({ totalFailedJobs: 0, withErrorText: 0, withoutErrorText: 0, byPlatform: [], byCause: [] });
  });
});
