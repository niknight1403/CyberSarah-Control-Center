import { describe, expect, it } from "vitest";

import { approveDraft, buildContentDraft, nextWeeklyRun } from "@/lib/content-distribution-logic";

describe("Content-Entwuerfe", () => {
  it("verlangt Kunde und Metrik fuer eine Case Study", () => {
    const result = buildContentDraft({ kind: "case_study", customer: "Acme" });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("kunde-und-metrik-erforderlich");
  });

  it("erzeugt eine Case Study mit Freigabepflicht", () => {
    const result = buildContentDraft({ kind: "case_study", customer: "Acme GmbH", metric: "38 % weniger Aufwand" });
    expect(result.ok).toBe(true);
    expect(result.draft?.requiresApproval).toBe(true);
    expect(result.draft?.publishAt).toBeNull();
    expect(result.draft?.title).toContain("Acme GmbH");
    expect(result.draft?.channels).toContain("linkedin");
  });

  it("baut Release Notes aus mehreren Features", () => {
    const result = buildContentDraft({ kind: "release_notes", features: ["HubSpot-Sync", "MRR-Dashboard"], version: "3.2.0" });
    expect(result.draft?.body).toContain("HubSpot-Sync");
    expect(result.draft?.body).toContain("MRR-Dashboard");
    expect(result.draft?.title).toContain("3.2.0");
  });

  it("lehnt Release Notes ohne Features ab", () => {
    expect(buildContentDraft({ kind: "release_notes", features: [] }).ok).toBe(false);
  });
});

describe("Terminierung", () => {
  it("plant den naechsten Lauf auf Montag 09:00 UTC", () => {
    const next = nextWeeklyRun(new Date("2026-11-01T15:00:00.000Z"));
    expect(next.toISOString()).toBe("2026-11-02T09:00:00.000Z");
  });

  it("springt eine Woche weiter, wenn Montag bereits vorbei ist", () => {
    const next = nextWeeklyRun(new Date("2026-11-02T10:00:00.000Z"));
    expect(next.toISOString()).toBe("2026-11-09T09:00:00.000Z");
  });
});

describe("Freigabe", () => {
  const draft = {
    kind: "case_study" as const,
    title: "Test",
    body: "Inhalt",
    channels: ["blog"],
    requiresApproval: true as const,
    publishAt: null,
  };

  it("setzt den Veroeffentlichungszeitpunkt erst nach Freigabe", () => {
    const approved = approveDraft(draft, "heinz", new Date("2026-11-03T08:00:00.000Z"));
    expect(approved?.publishAt).toBe("2026-11-03T08:00:00.000Z");
  });

  it("verweigert die Freigabe ohne Namen", () => {
    expect(approveDraft(draft, "  ", new Date())).toBeNull();
  });
});
