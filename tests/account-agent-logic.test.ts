import { describe, expect, it } from "vitest";

import {
  ACCOUNT_PROVIDERS,
  buildAccountId,
  buildSetupGuide,
  createAccountEntry,
  findProvider,
  maskSecret,
  nextAccountStep,
  reviewAccountConfiguration,
} from "@/lib/account-agent-logic";

describe("Konto-Katalog", () => {
  it("kennt alle benoetigten Anbieter", () => {
    expect(ACCOUNT_PROVIDERS.map((item) => item.key)).toEqual(["hubspot", "stripe", "firecrawl", "apollo", "resend"]);
  });

  it("legt keinen Eintrag fuer unbekannte Anbieter an", () => {
    const result = createAccountEntry({ provider: "unbekannt" });
    expect(result.ok).toBe(false);
  });
});

describe("Konto anlegen", () => {
  it("erzeugt einen Entwurf mit fehlenden Angaben", () => {
    const result = createAccountEntry({ provider: "hubspot" }, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("draft");
    expect(result.value.missingFields).toEqual(["HUBSPOT_PRIVATE_APP_TOKEN"]);
    expect(nextAccountStep(result.value)).toContain("HUBSPOT_PRIVATE_APP_TOKEN");
  });

  it("markiert ein vollstaendig konfiguriertes Konto als bereit", () => {
    const result = createAccountEntry({ provider: "firecrawl" }, { FIRECRAWL_API_KEY: "fc-1234567890abcdef" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("configured");
    expect(nextAccountStep(result.value)).toContain("Bereit");
  });

  it("bildet stabile Konto-IDs", () => {
    const now = new Date("2026-11-01T09:30:00.000Z");
    expect(buildAccountId("hubspot", now)).toBe("acct_hubspot_20261101093000");
  });
});

describe("Konfiguration pruefen", () => {
  it("maskiert Geheimnisse und gibt sie nie zurueck", () => {
    expect(maskSecret("pat-eu1-abcdefghijklmnop")).not.toContain("abcdefghij");
    const review = reviewAccountConfiguration("hubspot", { HUBSPOT_PRIVATE_APP_TOKEN: "pat-eu1-abcdefghijklmnop" });
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.value.ready).toBe(true);
    expect(review.value.masked[0].value).toContain("•");
  });

  it("erkennt zu kurze Geheimnisse als ungueltig", () => {
    const review = reviewAccountConfiguration("hubspot", { HUBSPOT_PRIVATE_APP_TOKEN: "kurz" });
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.value.ready).toBe(false);
    expect(review.value.invalid).toEqual(["HUBSPOT_PRIVATE_APP_TOKEN"]);
  });
});

describe("Einrichtungsanleitung", () => {
  it("nennt Anmeldung, Berechtigungen und Testschritt", () => {
    const guide = buildSetupGuide("stripe");
    expect(guide.ok).toBe(true);
    if (!guide.ok) return;
    expect(guide.value.steps.length).toBeGreaterThanOrEqual(6);
    expect(guide.value.envTemplate).toContain("STRIPE_SECRET_KEY=");
    expect(guide.value.scopes).toContain("billing:write");
  });

  it("verweist bei E-Mail-Versand auf die Domain-Verifizierung", () => {
    const guide = buildSetupGuide("resend");
    expect(guide.ok).toBe(true);
    if (!guide.ok) return;
    expect(guide.value.steps.join(" ")).toContain("SPF");
  });
});

describe("Anbieter-Suche", () => {
  it("findet vorhandene und ignoriert unbekannte", () => {
    expect(findProvider("apollo")?.label).toBe("Apollo.io");
    expect(findProvider("nicht-da")).toBeNull();
  });
});
