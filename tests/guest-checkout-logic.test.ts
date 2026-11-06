import { describe, expect, it } from "vitest";

import {
  AI_INFLUENZA_ENTRY_PACKAGE_ID,
  AI_INFLUENZA_HIDDEN_PACKAGE_IDS,
  aiInfluenzaBookingBlockReason,
  isAiInfluenzaPackageBookable,
} from "../lib/ai-influenza-team-logic";
import {
  MAGIC_LINK_TTL_MS,
  buildGuestCheckoutMetadata,
  buildMagicLinkUrl,
  evaluateMagicLink,
  guestDisplayName,
  guestOpenIdForEmail,
  magicLinkRedirectTarget,
  readGuestPurchase,
} from "../lib/guest-checkout-logic";

const NOW = 1_800_000_000_000;

const guestSession = {
  metadata: { packageId: "starter", orderId: "order-77", guest: "1" },
  customer_details: { email: "Kunde@Example.COM" },
  customer: "cus_123",
  client_reference_id: "order-77",
  mode: "subscription",
};

describe("readGuestPurchase", () => {
  it("erkennt einen Gast-Kauf und normalisiert die Adresse", () => {
    const purchase = readGuestPurchase(guestSession);
    expect(purchase).toEqual({
      email: "kunde@example.com",
      packageId: "starter",
      orderId: "order-77",
      customerId: "cus_123",
      isGuest: true,
    });
  });

  it("liefert null fuer Kontokaeufe", () => {
    expect(readGuestPurchase({ ...guestSession, metadata: { packageId: "starter" } })).toBeNull();
  });

  it("liefert null, wenn die Adresse fehlt oder unbrauchbar ist", () => {
    expect(readGuestPurchase({ ...guestSession, customer_details: null, customer_email: null })).toBeNull();
    expect(readGuestPurchase({ ...guestSession, customer_details: { email: "keine-adresse" } })).toBeNull();
  });

  it("liefert null ohne Paket", () => {
    expect(readGuestPurchase({ ...guestSession, metadata: { guest: "1" } })).toBeNull();
  });
});

describe("guestOpenIdForEmail", () => {
  it("ist stabil und unabhaengig von Gross-/Kleinschreibung", () => {
    expect(guestOpenIdForEmail("Kunde@Example.com")).toBe(guestOpenIdForEmail("kunde@example.com"));
    expect(guestOpenIdForEmail("kunde@example.com")).toMatch(/^guest-[0-9a-f]{8}$/);
    expect(guestOpenIdForEmail("a@b.de")).not.toBe(guestOpenIdForEmail("c@b.de"));
  });
});

describe("guestDisplayName", () => {
  it("macht aus der Adresse einen lesbaren Namen", () => {
    expect(guestDisplayName("maria.muster@firma.de")).toBe("Maria Muster");
    expect(guestDisplayName("info@firma.de")).toBe("Info");
    expect(guestDisplayName("@firma.de")).toBe("Kundin oder Kunde");
  });
});

describe("buildGuestCheckoutMetadata", () => {
  it("markiert den Kauf als Gast und traegt die Referenzen ein", () => {
    const metadata = buildGuestCheckoutMetadata({ packageId: "starter", orderId: "order-1", email: " a@b.de " });
    expect(metadata.guest).toBe("1");
    expect(metadata.packageId).toBe("starter");
    expect(metadata.orderId).toBe("order-1");
    expect(metadata.guestEmail).toBe("a@b.de");
    expect(metadata.businessUnit).toBe("ai-influenza-team");
  });

  it("laesst unbrauchbare Adressen weg, statt sie zu speichern", () => {
    const metadata = buildGuestCheckoutMetadata({ packageId: "starter", orderId: "order-1", email: "kaputt" });
    expect(metadata.guestEmail).toBeUndefined();
  });
});

describe("Anmeldelink", () => {
  it("kodiert den Token fuer die URL", () => {
    expect(buildMagicLinkUrl("https://app.cybersarah-ki.com/", "a+b/c=")).toBe(
      "https://app.cybersarah-ki.com/api/auth/magic?token=a%2Bb%2Fc%3D",
    );
  });

  it("fuehrt nach dem Login zum Paket, nicht auf die Startseite", () => {
    expect(magicLinkRedirectTarget("order-9")).toContain("order=order-9");
    expect(magicLinkRedirectTarget(null)).toBe("/ai-influenza-team?checkout=success");
  });

  it("akzeptiert einen frischen Link", () => {
    const result = evaluateMagicLink({
      tokenPresent: true,
      sessionOpenId: "guest-abc",
      issuedAt: NOW,
      now: NOW + 1_000,
      alreadyUsed: false,
    });
    expect(result).toEqual({ ok: true, openId: "guest-abc" });
  });

  it("lehnt abgelaufene, fehlende und bereits genutzte Links ab", () => {
    const base = { tokenPresent: true, sessionOpenId: "guest-abc", issuedAt: NOW, alreadyUsed: false };
    const expired = evaluateMagicLink({ ...base, now: NOW + MAGIC_LINK_TTL_MS + 1 });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toContain("abgelaufen");

    const missing = evaluateMagicLink({ ...base, tokenPresent: false, now: NOW });
    expect(missing.ok).toBe(false);

    const used = evaluateMagicLink({ ...base, alreadyUsed: true, now: NOW });
    expect(used.ok).toBe(false);
    if (!used.ok) expect(used.reason).toContain("bereits verwendet");

    const noOpenId = evaluateMagicLink({ ...base, sessionOpenId: null, now: NOW });
    expect(noOpenId.ok).toBe(false);
  });

  it("sieben Tage Laufzeit", () => {
    expect(MAGIC_LINK_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("Paket-Sperre (Task 5)", () => {
  it("sperrt das High-Ticket-Paket und laesst den Einstieg offen", () => {
    expect(AI_INFLUENZA_HIDDEN_PACKAGE_IDS).toContain("business");
    expect(isAiInfluenzaPackageBookable("business")).toBe(false);
    expect(isAiInfluenzaPackageBookable("starter")).toBe(true);
    expect(AI_INFLUENZA_ENTRY_PACKAGE_ID).toBe("starter");
  });

  it("begruendet die Sperre mit dem Preis und dem fehlenden Lieferpfad", () => {
    const reason = aiInfluenzaBookingBlockReason("business");
    expect(reason).toContain("2499");
    expect(reason).toContain("nicht buchbar");
    expect(aiInfluenzaBookingBlockReason("starter")).toBeNull();
  });
});
