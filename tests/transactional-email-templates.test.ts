import { describe, expect, it } from "vitest";

import { EMAIL_LIMITS, validateEmailDispatch } from "../lib/email-logic";
import {
  INTRO_REQUEST_OPT_IN_SOURCE,
  buildIntroRequestAdminNotice,
  buildIntroRequestConfirmation,
  buildMagicLinkEmail,
  resolveAdminNotifyAddress,
  toDispatchInput,
} from "../lib/transactional-email-templates";

const confirmationInput = {
  name: "Maria Muster",
  email: "maria@musterbetrieb.de",
  packageLabel: "Starter",
  preferredWindowLabel: "Diese Woche",
  goal: "Mehr Sichtbarkeit auf LinkedIn",
  receivedAt: "2026-11-06T20:00:00.000Z",
  requestId: "4711",
};

const adminInput = {
  requestId: "4711",
  name: "Maria Muster",
  email: "maria@musterbetrieb.de",
  company: "Musterbetrieb GmbH",
  domain: "musterbetrieb.de",
  packageLabel: "Starter",
  preferredWindowLabel: "Diese Woche",
  goal: "Mehr Sichtbarkeit auf LinkedIn",
  leadScore: 72,
  leadTier: "warm",
  receivedAt: "2026-11-06T20:00:00.000Z",
  adminUrl: "https://app.cybersarah-ki.com/ai-influenza-team",
};

describe("resolveAdminNotifyAddress", () => {
  it("nimmt die fachlich richtige Adresse zuerst", () => {
    expect(
      resolveAdminNotifyAddress({
        AI_INFLUENZA_NOTIFY_EMAIL: "team@cybersarah-ki.com",
        ADMIN_EMAIL: "admin@cybersarah-ki.com",
      }),
    ).toBe("team@cybersarah-ki.com");
  });

  it("faellt auf ADMIN_EMAIL zurueck", () => {
    expect(resolveAdminNotifyAddress({ ADMIN_EMAIL: "admin@cybersarah-ki.com" })).toBe("admin@cybersarah-ki.com");
  });

  it("erfindet keine Adresse", () => {
    expect(resolveAdminNotifyAddress({})).toBeNull();
    expect(resolveAdminNotifyAddress({ ADMIN_EMAIL: "keine-adresse" })).toBeNull();
  });
});

describe("buildIntroRequestConfirmation", () => {
  it("bestaetigt den Eingang ohne Termin zu versprechen", () => {
    const { draft, to } = buildIntroRequestConfirmation(confirmationInput);
    expect(to).toBe("maria@musterbetrieb.de");
    expect(draft.subject).toContain("angekommen");
    expect(draft.body).toContain("Diese Mail bestätigt nur den Eingang, nicht einen Termin.");
    expect(draft.body).toContain("Referenz: 4711");
    expect(draft.body).toContain("Mehr Sichtbarkeit auf LinkedIn");
    expect(draft.body).toContain("keine Zahlung durch diese Anfrage");
  });

  it("ist ein gueltiger Versandauftrag mit dokumentiertem Opt-in", () => {
    const { draft, to } = buildIntroRequestConfirmation(confirmationInput);
    const input = toDispatchInput(draft, to, { documented: true, source: INTRO_REQUEST_OPT_IN_SOURCE });
    expect(validateEmailDispatch(input).valid).toBe(true);
    expect(input.kind).toBe("intro_request_confirmation");
    expect(input.subject.length).toBeGreaterThanOrEqual(EMAIL_LIMITS.subject.min);
    expect(input.body.length).toBeLessThanOrEqual(EMAIL_LIMITS.body.max);
  });

  it("haelt den Idempotenz-Schluessel stabil", () => {
    const first = buildIntroRequestConfirmation(confirmationInput);
    const second = buildIntroRequestConfirmation(confirmationInput);
    expect(first.draft.idempotencyKey).toBe(second.draft.idempotencyKey);
    expect(first.draft.idempotencyKey).toBe("intro-request-confirm:4711");
  });
});

describe("buildIntroRequestAdminNotice", () => {
  it("nennt alle Angaben, die eine Antwort ermoeglichen", () => {
    const draft = buildIntroRequestAdminNotice(adminInput);
    expect(draft.subject).toContain("Musterbetrieb GmbH");
    expect(draft.body).toContain("maria@musterbetrieb.de");
    expect(draft.body).toContain("Lead-Score: 72 (warm)");
    expect(draft.body).toContain("Es wurde nichts automatisch versendet oder gebucht.");
    expect(draft.idempotencyKey).toBe("intro-request-admin:4711");
  });

  it("bleibt ohne Domain und ohne Notiz lesbar", () => {
    const draft = buildIntroRequestAdminNotice({ ...adminInput, domain: null, goal: null, leadTier: null, leadScore: null });
    expect(draft.body).toContain("Domain: nicht angegeben");
    expect(draft.body).toContain("Lead-Score: —");
  });
});

describe("buildMagicLinkEmail", () => {
  it("enthaelt Link, Laufzeit und Auftrag", () => {
    const draft = buildMagicLinkEmail({
      magicUrl: "https://app.cybersarah-ki.com/api/auth/magic?token=abc",
      packageLabel: "Starter",
      orderId: "order-1",
      expiresAt: "2026-11-13T20:00:00.000Z",
    });
    expect(draft.subject).toBe("Dein Zugang zum AI Influenza Team");
    expect(draft.body).toContain("https://app.cybersarah-ki.com/api/auth/magic?token=abc");
    expect(draft.body).toContain("2026-11-13T20:00:00.000Z");
    expect(draft.body).toContain("Ein Passwort brauchst du nicht");
    // Kein Einmal-Versprechen ohne serverseitige Pruefung.
    expect(draft.body).not.toContain("nur einmal verwendbar");
    expect(draft.idempotencyKey).toBe("magic-link:order-1");
  });

  it("ist ein gueltiger Versandauftrag", () => {
    const draft = buildMagicLinkEmail({
      magicUrl: "https://example.com/api/auth/magic?token=abc",
      packageLabel: "Growth",
      orderId: "order-2",
      expiresAt: "2026-11-13T20:00:00.000Z",
    });
    const input = toDispatchInput(draft, "kunde@example.com", {
      documented: true,
      source: "Kauf via Stripe (Vertragserfüllung)",
    });
    expect(validateEmailDispatch(input).valid).toBe(true);
  });
});
