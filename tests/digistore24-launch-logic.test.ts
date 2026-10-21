import { describe, expect, it } from "vitest";

import {
  escapeHtml,
  renderLandingHtml,
  slugifyLanding,
  validateFunnelForLaunch,
} from "../lib/digistore24-launch-logic";

const funnel = {
  headline: "Mehr Kunden mit <b>KI</b>",
  subheadline: 'Schneller "starten"',
  benefits: ["Sprachsteuerung", "Automatisierung"],
  ctaText: "Jetzt starten",
  audience: "Solo-Selbststaendige",
};

describe("digistore24-launch-logic", () => {
  it("escaped HTML aus untrusted LLM-Texten", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("slugifiziert Titel stabil und URL-sicher", () => {
    expect(slugifyLanding("KI-Tools für Gründer: Der Über-Blick!")).toBe(
      "ki-tools-fuer-gruender-der-ueber-blick",
    );
    expect(slugifyLanding("???")).toBe("angebot");
  });

  it("verweigert Launch ohne echten Affiliate-Link", () => {
    const check = validateFunnelForLaunch({
      productTitle: "Produkt",
      affiliateUrl: "",
      funnel,
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toContain("Affiliate-Ziel-Link");
  });

  it("verweigert Launch ohne Headline oder Benefits", () => {
    expect(
      validateFunnelForLaunch({
        productTitle: "P",
        affiliateUrl: "https://www.digistore24.com/product/1",
        funnel: { headline: "", benefits: ["x"] },
      }).ok,
    ).toBe(false);
    expect(
      validateFunnelForLaunch({
        productTitle: "P",
        affiliateUrl: "https://www.digistore24.com/product/1",
        funnel: { headline: "H", benefits: [] },
      }).ok,
    ).toBe(false);
  });

  it("akzeptiert vollstaendige Funnels", () => {
    expect(
      validateFunnelForLaunch({
        productTitle: "Produkt",
        affiliateUrl: "https://www.digistore24.com/product/1",
        funnel,
      }).ok,
    ).toBe(true);
  });

  it("rendert Landingpage mit escaping, CTA-Dopplung und Affiliate-Hinweis", () => {
    const html = renderLandingHtml({
      campaignName: "CyberSarah Kampagne",
      productTitle: "Test <Produkt>",
      affiliateUrl: "https://www.digistore24.com/product/1?a=b&c=d",
      funnel,
    });
    expect(html).toContain("&lt;b&gt;KI&lt;/b&gt;");
    expect(html).not.toContain("<script>alert");
    expect((html.match(/class="cta"/g) ?? []).length).toBe(2);
    expect(html).toContain("rel=\"nofollow sponsored noopener\"");
    expect(html).toContain("a=b&amp;c=d");
    expect(html).toContain("Affiliate-Empfehlung");
    expect(html).toContain("Test &lt;Produkt&gt;");
  });
});

describe("CTA-Tracking", () => {
  const base = {
    campaignName: "Test-Kampagne",
    productTitle: "Test-Produkt",
    affiliateUrl: "https://example.com/aff?ref=1",
    funnel: {
      headline: "Sicher",
      subheadline: "",
      benefits: ["A"],
      ctaText: "Kaufen",
      audience: "",
      keywords: [],
    },
  };

  it("nutzt clickUrl als CTA-Ziel, wenn gesetzt", () => {
    const html = renderLandingHtml({ ...base, clickUrl: "https://hub.cybersarah-ki.com/ccc/landings/test/click" });
    expect(html).toContain('href="https://hub.cybersarah-ki.com/ccc/landings/test/click"');
    expect(html).not.toContain('href="https://example.com/aff?ref=1"');
  });

  it("verlinkt ohne clickUrl direkt auf den Affiliate-Link", () => {
    const html = renderLandingHtml({ ...base });
    expect(html).toContain('href="https://example.com/aff?ref=1"');
  });
});
