import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  autopilotProductStatus, buildCreateProductParams, catalogSlug, buildPaymentPlanParams, checkoutUrl,
  euroAmount, intervalLabel, parseProductIdeas, planNextProducts, productNameKey,
  readCreatedPaymentPlanId, readCreatedProductId, safeErrorMessage, summarizeRun,
  type ProductIdea,
} from "../lib/product-autopilot-logic";
import { loadProductIdeas, runProductAutopilot } from "../server/product-autopilot";

const idea = (over: Partial<ProductIdea> = {}): ProductIdea => ({
  slug: "agentur-os-starter",
  name: "CyberSarah Agentur-OS - Starter",
  priceCents: 29900,
  interval: "1_month",
  description: "Beschreibung",
  accessInstructions: "Zugang",
  rationale: "Wettbewerbsmatrix",
  approved: true,
  ...over,
});

describe("Produkt-Autopilot: Ideenkatalog", () => {
  it("behaelt gueltige Ideen und normalisiert den Slug", () => {
    const [parsed] = parseProductIdeas([{ ...idea(), slug: "  Agentur-OS-Starter  " }]);
    expect(parsed.slug).toBe("agentur-os-starter");
    expect(parsed.priceCents).toBe(29900);
  });

  it("verwirft unbrauchbare Slugs, Preise und Intervalle", () => {
    expect(parseProductIdeas([{ ...idea(), slug: "kein slug!" }])).toHaveLength(0);
    expect(parseProductIdeas([{ ...idea(), priceCents: 0 }])).toHaveLength(0);
    expect(parseProductIdeas([{ ...idea(), priceCents: 12.5 }])).toHaveLength(0);
    expect(parseProductIdeas([{ ...idea(), interval: "2_weeks" }])).toHaveLength(0);
    expect(parseProductIdeas([{ ...idea(), name: " " }])).toHaveLength(0);
  });

  it("behandelt nur echtes true als Freigabe", () => {
    expect(parseProductIdeas([{ ...idea(), approved: "true" }])[0].approved).toBe(false);
    expect(parseProductIdeas([{ ...idea(), approved: true }])[0].approved).toBe(true);
  });

  it("entfernt doppelte Slugs", () => {
    expect(parseProductIdeas([idea(), idea()])).toHaveLength(1);
  });

  it("liest den gebuendelten Katalog", () => {
    const { ideas, error, source } = loadProductIdeas();
    expect(source).toBe("bundled");
    expect(error).toBeUndefined();
    expect(ideas.length).toBeGreaterThanOrEqual(2);
    expect(ideas.filter((entry) => entry.approved).length).toBeGreaterThanOrEqual(2);
    expect(ideas.every((entry) => entry.rationale.length > 20)).toBe(true);
  });
});

describe("Produkt-Autopilot: Auswahl", () => {
  const base = { maxProducts: 3, totalCreated: 0 };

  it("legt nur freigegebene Ideen an", () => {
    const plan = planNextProducts({
      ...base, ideas: [idea({ slug: "a", approved: false }), idea({ slug: "b" })],
      localSlugs: new Set(), remoteNames: [],
    });
    expect(plan.toCreate.map((entry) => entry.slug)).toEqual(["b"]);
    expect(plan.skipped).toEqual([{ slug: "a", reason: "not_approved" }]);
  });

  it("ueberspringt bereits angelegte Ideen", () => {
    const plan = planNextProducts({ ...base, ideas: [idea()], localSlugs: new Set(["agentur-os-starter"]), remoteNames: [] });
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("already_local");
  });

  it("erkennt Duplikate auch ueber den Produktnamen bei Digistore24", () => {
    const plan = planNextProducts({
      ...base, ideas: [idea()], localSlugs: new Set(), remoteNames: ["  cyberSARAH agentur os starter "],
    });
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.skipped[0].reason).toBe("already_remote");
  });

  it("respektiert die Obergrenze je Lauf", () => {
    const ideas = Array.from({ length: 6 }, (_, index) => idea({ slug: `idee-${index}` }));
    const plan = planNextProducts({ ideas, localSlugs: new Set(), remoteNames: [], maxProducts: 99, totalCreated: 0 });
    expect(plan.toCreate).toHaveLength(3);
  });

  it("respektiert die Gesamtobergrenze", () => {
    const ideas = Array.from({ length: 3 }, (_, index) => idea({ slug: `idee-${index}` }));
    const plan = planNextProducts({ ideas, localSlugs: new Set(), remoteNames: [], maxProducts: 3, totalCreated: 19 });
    expect(plan.toCreate).toHaveLength(1);
  });

  it("legt bei maxProducts=0 nichts an", () => {
    const plan = planNextProducts({ ...base, maxProducts: 0, ideas: [idea()], localSlugs: new Set(), remoteNames: [] });
    expect(plan.toCreate).toHaveLength(0);
  });
});

describe("Produkt-Autopilot: Parameter fuer Digistore24", () => {
  it("baut createProduct mit Software-Typ, EUR und ohne Preis", () => {
    const params = buildCreateProductParams(idea(), { thankYouUrl: "https://app.cybersarah-ki.com/" });
    expect(params["data[name_de]"]).toBe("CyberSarah Agentur-OS - Starter");
    expect(params["data[currency]"]).toBe("EUR");
    expect(params["data[product_type_id]"]).toBe("37");
    expect(params["data[language]"]).toBe("de");
    expect(params["data[is_search_engine_allowed]"]).toBe("N");
    expect(Object.keys(params).some((key) => key.includes("amount") || key.includes("price"))).toBe(false);
  });

  it("baut den Preisplan als Abo mit gleichbleibender Rate", () => {
    const params = buildPaymentPlanParams(idea({ priceCents: 89900 }), "762354");
    expect(params.product_id).toBe("762354");
    expect(params["data[first_amount]"]).toBe("899.00");
    expect(params["data[other_amounts]"]).toBe("899.00");
    expect(params["data[first_billing_interval]"]).toBe("1_month");
    expect(params["data[number_of_installments]"]).toBe("0");
    expect(params["data[currency]"]).toBe("EUR");
  });

  it("formatiert Betraege und Intervalle sauber", () => {
    expect(euroAmount(4900)).toBe("49.00");
    expect(euroAmount(5)).toBe("0.05");
    expect(intervalLabel(idea())).toBe("Monatlich 299 €");
    expect(intervalLabel(idea({ interval: "3_month", priceCents: 8900 }))).toBe("Alle 3 Monate 89 €");
    expect(intervalLabel(idea({ interval: "12_month", priceCents: 249900 }))).toBe("Jährlich 2499 €");
    expect(checkoutUrl(762354)).toBe("https://www.checkout-ds24.com/product/762354");
  });
});

describe("Produkt-Autopilot: Antworten und Fehler", () => {
  it("nutzt denselben Katalog-Slug wie der IPN-Pfad", () => {
    // Der IPN-Handler normalisiert product_id zum Slug; 762354 bleibt 762354.
    expect(catalogSlug(762354)).toBe("762354");
    expect(catalogSlug(" 762354 ")).toBe("762354");
  });

  it("liest Produkt- und Plan-IDs", () => {
    expect(readCreatedProductId({ data: { product_id: 762354 } })).toBe("762354");
    expect(readCreatedProductId({ data: { product_id: "762355" } })).toBe("762355");
    expect(readCreatedProductId({ data: {} })).toBeNull();
    expect(readCreatedProductId(null)).toBeNull();
    expect(readCreatedPaymentPlanId({ data: { paymentplan_id: 1556381 } })).toBe("1556381");
    expect(readCreatedPaymentPlanId({ data: { paymentplan_id: "abc" } })).toBeNull();
  });

  it("maskiert Geheimnisse in Fehlermeldungen", () => {
    const message = safeErrorMessage(new Error("401 fuer Schluessel 1783abcdefghijklmnopqrstuvwxyz012345"));
    expect(message).not.toContain("1783abcdefghijklmnopqrstuvwxyz012345");
    expect(message).toContain("***");
  });

  it("zaehlt den Lauf zusammen", () => {
    expect(summarizeRun({ created: [{ slug: "a" }], skipped: [{ slug: "b", reason: "cap_reached" }], failed: [] }))
      .toBe("1 angelegt, 1 uebersprungen, 0 fehlgeschlagen");
  });

  it("meldet Produkte nie als live", () => {
    expect(autopilotProductStatus()).toBe("awaiting_approval");
  });
});

describe("Produkt-Autopilot: Lauf ohne Voraussetzungen", () => {
  const originalKey = process.env.DIGISTORE24_API_KEY;
  beforeEach(() => { delete process.env.DIGISTORE24_API_KEY; });
  afterEach(() => { if (originalKey) process.env.DIGISTORE24_API_KEY = originalKey; });

  it("bricht ehrlich ab, wenn der API-Key fehlt", async () => {
    const result = await runProductAutopilot({ maxProducts: 1 });
    expect(result.ok).toBe(false);
    expect(result.mode).toBe("blocked");
    expect(result.detail).toContain("DIGISTORE24_API_KEY");
    expect(result.created).toHaveLength(0);
  });

  it("plant im Trockenlauf, ohne Netzwerk oder Datenbank zu brauchen", async () => {
    process.env.DIGISTORE24_API_KEY = "test-key-nur-fuer-den-trockenlauf";
    const result = await runProductAutopilot({ maxProducts: 1, dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("dry_run");
    expect(result.remaining).toBe(1);
    expect(result.created).toHaveLength(0);
  });
});

describe("Produkt-Autopilot: Namensnormalisierung", () => {
  it("vereinheitlicht Schreibweisen", () => {
    expect(productNameKey("CyberSarah Agentur-OS - Starter")).toBe("cybersarah agentur os starter");
    expect(productNameKey("  CyberSarah   Agentur-OS - Starter ")).toBe(productNameKey("cybersarah agentur os starter"));
  });
});
