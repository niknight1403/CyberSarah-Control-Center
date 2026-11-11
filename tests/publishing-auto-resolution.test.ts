import { describe, expect, it } from "vitest";

import {
  MIN_MATCH_TEXT_LENGTH,
  UNCERTAIN_AUTO_CLOSE_HOURS,
  decideUncertainResolution,
  matchPostByText,
  normalizeForMatch,
  resolveVerificationText,
  summarizeEscalationReasons,
  summarizeUncertainResolutions,
  type PublishingVerification,
} from "../lib/publishing-auto-resolution-logic";
import { verifyPublishingOnPlatform } from "../server/publishing-auto-resolution";

const NOW = Date.UTC(2026, 10, 11, 9, 0, 0);
const HOUR = 3_600_000;
const SENT_TEXT = "Vertrauen durch transparente KI-Kommunikation aufbauen — ehrlich, ohne Buzzwords.";

function verifyAt(outcome: "found" | "not_found" | "unverifiable", checkedAtMs = NOW - HOUR): PublishingVerification {
  if (outcome === "found") return { outcome, externalId: "1899234567890", detail: "Test", checkedAtMs };
  return { outcome, detail: "Test", checkedAtMs };
}

describe("Sprint 11: autonome Aufloesung ungeklaerter Veroeffentlichungen", () => {
  it("bestaetigt einen Job, wenn der Beitrag auf der Plattform nachgewiesen ist", () => {
    const decision = decideUncertainResolution({
      jobId: 13, platform: "x", updatedAtMs: NOW - 7 * 24 * HOUR,
      verification: verifyAt("found"), nowMs: NOW,
    });
    expect(decision.action).toBe("confirm");
    expect(decision.externalId).toBe("1899234567890");
    expect(decision.evidence).toContain("Automatische Plattformpruefung");
  });

  it("schliesst einen Job nach abgelaufener Frist ohne Fund — ohne Neuversand", () => {
    const decision = decideUncertainResolution({
      jobId: 16, platform: "x", updatedAtMs: NOW - (UNCERTAIN_AUTO_CLOSE_HOURS + 1) * HOUR,
      verification: verifyAt("not_found"), nowMs: NOW,
    });
    expect(decision.action).toBe("close");
    expect(decision.evidence).toContain("kein passender Beitrag gefunden");
    expect(decision.evidence).toContain("Kein Neuversand");
  });

  it("laesst die Frist laufen, solange sie nicht abgelaufen ist", () => {
    const decision = decideUncertainResolution({
      jobId: 16, platform: "x", updatedAtMs: NOW - 5 * HOUR,
      verification: verifyAt("not_found"), nowMs: NOW,
    });
    expect(decision.action).toBe("wait");
    expect(decision.reason).toContain("Frist laeuft noch");
  });

  it("entscheidet nie ohne Pruefung — dann bleibt der Mensch zustaendig", () => {
    const decision = decideUncertainResolution({
      jobId: 13, platform: "tiktok", updatedAtMs: NOW - 9 * 24 * HOUR,
      verification: null, nowMs: NOW,
    });
    expect(decision.action).toBe("escalate");
    expect(decision.evidence).toBeNull();
  });

  it("schliesst nichts, wenn die Plattformpruefung technisch nicht moeglich war", () => {
    const decision = decideUncertainResolution({
      jobId: 13, platform: "linkedin", updatedAtMs: NOW - 30 * 24 * HOUR,
      verification: { outcome: "unverifiable", detail: "HTTP 500", checkedAtMs: NOW - HOUR }, nowMs: NOW,
    });
    expect(decision.action).toBe("escalate");
    expect(decision.reason).toContain("HTTP 500");
  });

  it("verwirft eine Pruefung, die aelter ist als der letzte Versand", () => {
    const decision = decideUncertainResolution({
      jobId: 13, platform: "x", updatedAtMs: NOW - 2 * HOUR,
      verification: verifyAt("found", NOW - 3 * HOUR), nowMs: NOW,
    });
    expect(decision.action).toBe("wait");
    expect(decision.reason).toContain("aelter als der letzte Versand");
  });

  it("wartet die Mindestzeit nach dem Absenden ab", () => {
    const decision = decideUncertainResolution({
      jobId: 13, platform: "x", updatedAtMs: NOW - 60_000,
      verification: verifyAt("found", NOW - 60_000), nowMs: NOW,
    });
    expect(decision.action).toBe("wait");
    expect(decision.reason).toContain("Provider braucht Zeit");
  });

  it("entscheidet auch bei frischer Pruefung — die Wartezeit gilt dem Versand", () => {
    // Regression: vorher wurde die Frische der PRUEFUNG als Wartezeit
    // gelesen. Damit blieb jeder Vorgang ewig "wartend", weil eine gerade
    // erstellte Pruefung immer juenger als 10 Minuten ist.
    const decision = decideUncertainResolution({
      jobId: 16, platform: "x", updatedAtMs: NOW - 4 * 24 * HOUR,
      verification: { outcome: "not_found", detail: "10 Beitraege geprueft", checkedAtMs: NOW }, nowMs: NOW,
    });
    expect(decision.action).toBe("close");
  });

  it("lehnt einen Fund ohne verwertbare Beitrags-ID ab", () => {
    const decision = decideUncertainResolution({
      jobId: 13, platform: "x", updatedAtMs: NOW - 5 * HOUR,
      verification: { outcome: "found", externalId: "unknown", detail: "Test", checkedAtMs: NOW - HOUR }, nowMs: NOW,
    });
    expect(decision.action).toBe("escalate");
    expect(decision.reason).toContain("unbrauchbar");
  });

  it("zaehlt die Entscheidungen korrekt zusammen", () => {
    const summary = summarizeUncertainResolutions([
      decideUncertainResolution({ jobId: 1, platform: "x", updatedAtMs: NOW - 7 * 24 * HOUR, verification: verifyAt("found"), nowMs: NOW }),
      decideUncertainResolution({ jobId: 2, platform: "x", updatedAtMs: NOW - 7 * 24 * HOUR, verification: verifyAt("not_found"), nowMs: NOW }),
      decideUncertainResolution({ jobId: 3, platform: "x", updatedAtMs: NOW - HOUR, verification: null, nowMs: NOW }),
    ]);
    expect(summary).toMatchObject({ confirm: 1, close: 1, escalate: 1, total: 3 });
  });
});

describe("Sprint 11: Textabgleich der Plattformpruefung", () => {
  it("normalisiert Umlaute, Links und Satzzeichen", () => {
    expect(normalizeForMatch("Grüße aus Köln! https://x.com/a")).toBe("gruße aus koln");
  });

  it("findet den Beitrag ueber den Textanfang", () => {
    const match = matchPostByText([
      { externalId: "1899234567890", text: `${SENT_TEXT} Und noch ein Zusatz.` },
    ], SENT_TEXT);
    expect(match?.externalId).toBe("1899234567890");
  });

  it("ordnet kurze Texte nie zu", () => {
    expect(SENT_TEXT.length).toBeGreaterThan(MIN_MATCH_TEXT_LENGTH);
    expect(matchPostByText([{ externalId: "1", text: "Hallo Welt" }], "Hallo Welt")).toBeNull();
  });

  it("ignoriert Treffer ohne brauchbare externe ID", () => {
    expect(matchPostByText([{ externalId: "ig-unknown", text: SENT_TEXT }], SENT_TEXT)).toBeNull();
  });
});

describe("Sprint 11: schreibgeschuetzte Plattformpruefung", () => {
  const job = { platform: "bluesky", contentOverride: SENT_TEXT };

  it("liest Bluesky oeffentlich und findet den Beitrag", async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({
        records: [
          { uri: "at://did:plc:abc/app.bsky.feed.post/3k", value: { text: "Anderer Beitrag" } },
          { uri: "at://did:plc:abc/app.bsky.feed.post/3m", value: { text: SENT_TEXT, createdAt: "2026-11-11T08:00:00Z" } },
        ],
      }),
    })) as unknown as typeof fetch;
    const verification = await verifyPublishingOnPlatform(job, {
      fetch: fetchImpl, credentials: { bluesky: { token: "pw", endpointUserId: "cybersarah.bsky.social" } }, now: () => NOW,
    });
    expect(verification.outcome).toBe("found");
    if (verification.outcome === "found") expect(verification.externalId).toBe("at://did:plc:abc/app.bsky.feed.post/3m");
  });

  it("meldet not_found nur bei erfolgreicher Abfrage ohne Treffer", async () => {
    const fetchImpl = (async () => ({ ok: true, json: async () => ({ records: [] }) })) as unknown as typeof fetch;
    const verification = await verifyPublishingOnPlatform(job, {
      fetch: fetchImpl, credentials: { bluesky: { token: "pw", endpointUserId: "cybersarah.bsky.social" } }, now: () => NOW,
    });
    expect(verification.outcome).toBe("not_found");
  });

  it("macht aus einem Netzwerkfehler ehrlich unverifiable statt not_found", async () => {
    const fetchImpl = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    const verification = await verifyPublishingOnPlatform(job, {
      fetch: fetchImpl, credentials: { bluesky: { token: "pw", endpointUserId: "cybersarah.bsky.social" } }, now: () => NOW,
    });
    expect(verification.outcome).toBe("unverifiable");
    if (verification.outcome === "unverifiable") expect(verification.detail).toContain("503");
  });

  it("prueft nicht ohne gespeicherten Sendetext", async () => {
    const verification = await verifyPublishingOnPlatform({ platform: "x", contentOverride: null }, { now: () => NOW });
    expect(verification.outcome).toBe("unverifiable");
    if (verification.outcome === "unverifiable") expect(verification.detail).toContain("nicht gespeichert");
  });

  it("meldet fehlende Zugangsdaten als unverifiable (kein Blind-Verdacht)", async () => {
    const verification = await verifyPublishingOnPlatform({ platform: "x", contentOverride: SENT_TEXT }, {
      credentials: {}, now: () => NOW,
    });
    expect(verification.outcome).toBe("unverifiable");
  });

  it("benennt TikTok als nicht lesbar statt zu raten", async () => {
    const verification = await verifyPublishingOnPlatform({ platform: "tiktok", contentOverride: SENT_TEXT }, {
      credentials: { tiktok: { token: "t" } }, now: () => NOW,
    });
    expect(verification.outcome).toBe("unverifiable");
    if (verification.outcome === "unverifiable") expect(verification.detail).toContain("Lesezugriff");
  });
});

describe("Sprint 11: Textgrundlage fuer den Abgleich", () => {
  it("nimmt den gespeicherten Sendetext, wenn vorhanden", () => {
    const resolved = resolveVerificationText({ contentOverride: "Der gesendete Text steht hier.", draftContent: "Entwurf" });
    expect(resolved.source).toBe("override");
    expect(resolved.text).toBe("Der gesendete Text steht hier.");
  });

  it("faellt bei Altjobs auf den freigegebenen Quell-Entwurf zurueck", () => {
    // Regression: Jobs vor Sprint 11 haben keinen content_override. Ohne
    // diesen Rueckfall blieben sie dauerhaft "beim Menschen".
    const resolved = resolveVerificationText({ contentOverride: null, draftContent: "Freigegebener Entwurf fuer X." });
    expect(resolved.source).toBe("draft");
    expect(resolved.text).toBe("Freigegebener Entwurf fuer X.");
  });

  it("rät nicht, wenn beide Texte fehlen oder zu kurz sind", () => {
    expect(resolveVerificationText({ contentOverride: "  ", draftContent: "kurz" }))
      .toEqual({ text: "", source: "none" });
  });
});

describe("Sprint 11: Eskalationsgruende", () => {
  it("gruppiert nach Plattform und Kategorie, ohne Inhalte", () => {
    const grouped = summarizeEscalationReasons([
      { action: "escalate", platform: "x", reason: "Plattformpruefung nicht moeglich: X-Refresh fehlgeschlagen" },
      { action: "escalate", platform: "x", reason: "Plattformpruefung nicht moeglich: kein Token" },
      { action: "escalate", platform: "linkedin", reason: "Keine Plattformpruefung vorhanden (5 Tage offen) — Mensch muss pruefen." },
      { action: "confirm", platform: "bluesky", reason: "egal" },
    ]);
    expect(grouped.byPlatform).toEqual({ x: 2, linkedin: 1 });
    expect(grouped.byReason).toEqual({ pruefung_nicht_moeglich: 2, keine_pruefung: 1 });
  });
});
