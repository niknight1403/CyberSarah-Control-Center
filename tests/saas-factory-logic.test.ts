import { describe, expect, it } from "vitest";
import { SAAS_TEMPLATES, pickSaaSTemplate, planSaaSToolBuild, scoreSaaSToolIdea, slugifySaaSTool } from "../modules/saas-factory/saas-factory-logic";

describe("SaaS-Fabrik", () => {
  it("kennt alle Micro-Tool-Templates", () => {
    expect(SAAS_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(SAAS_TEMPLATES.map((t) => t.id)).toContain("qr-generator");
  });

  it("slugify ist SEO-safe und umlautsicher", () => {
    expect(slugifySaaSTool("Grüße aus München!")).toBe("gruesse-aus-muenchen");
    expect(slugifySaaSTool("!!!")).toBe("micro-tool");
  });

  it("waehlt das Template nach Keyword-Treffer", () => {
    expect(pickSaaSTemplate("pdf zusammenfügen bitte").id).toBe("pdf-merger");
    expect(pickSaaSTemplate("qr code generator").id).toBe("qr-generator");
  });

  it("bewertet Ideen ehrlich: Evergreen hoch, Satt-Signale ab", () => {
    const good = scoreSaaSToolIdea("Kostenloser QR Code Generator online", "QR-Codes gratis erstellen");
    const bad = scoreSaaSToolIdea("Casino Vergleichsrechner", "krypto-trading tipps casino");
    expect(good.score).toBeGreaterThan(bad.score);
    expect(bad.reasons.some((reason) => reason.includes("Risiko-Signal"))).toBe(true);
  });

  it("Build-Plan: 6 Schritte, geschaetzte Stunden, Freigabe-Schritt enthalten", () => {
    const plan = planSaaSToolBuild("Rechnung Rechner", "MwSt fuer Freelancer");
    expect(plan.steps).toHaveLength(6);
    expect(plan.steps.some((step) => step.includes("Draft-Engine"))).toBe(true);
    expect(plan.estimatedHours).toBeGreaterThan(0);
    expect(plan.idea.slug).toBe("rechnung-rechner");
  });
});
