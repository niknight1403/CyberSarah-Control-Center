import { describe, expect, it } from "vitest";
import {
  filterCatalogProducts,
  normalizeCatalogSearch,
  reviewCatalogProduct,
  type ReviewPriceInput,
  type ReviewProductInput,
} from "../lib/admin-catalog-mobile-logic";

const price = (over: Partial<ReviewPriceInput> & { id: string }): ReviewPriceInput => ({
  currency: "eur",
  amountMinor: 1900,
  billing: "one_time",
  interval: null,
  intervalCount: null,
  taxBehavior: "inclusive",
  active: true,
  createdAtMs: Date.parse("2026-09-01T00:00:00Z"),
  isDefault: false,
  ...over,
});

const product = (over: Partial<ReviewProductInput> & { id: string }): ReviewProductInput => ({
  name: "Testprodukt",
  active: true,
  defaultPriceId: "price_default",
  priceCount: 1,
  issues: [],
  ...over,
});

describe("Sprint 30 – Admin-Produktkatalog mobil filtern und freigeben", () => {
  it("gibt ein sauberes Produkt frei, wenn Katalog vollstaendig und Standardpreis aktiv ist", () => {
    const review = reviewCatalogProduct(
      product({ id: "prod_ok" }),
      [price({ id: "price_default", isDefault: true })],
      { catalogComplete: true },
    );
    expect(review).toMatchObject({ verdict: "freigabefaehig", eligible: true, blockers: [], warnings: [] });
  });

  it("verweigert Freigabe auf Teilkatalog, auch wenn das Produkt sauber wirkt", () => {
    const review = reviewCatalogProduct(
      product({ id: "prod_partial" }),
      [price({ id: "price_default", isDefault: true })],
      { catalogComplete: false },
    );
    expect(review.eligible).toBe(false);
    expect(review.verdict).toBe("blockiert");
    expect(review.blockers[0]).toContain("Katalog unvollstaendig");
  });

  it("blockiert inaktive Produkte, fehlende oder inaktive Standardpreise", () => {
    expect(reviewCatalogProduct(product({ id: "p1", active: false }), [price({ id: "price_default", isDefault: true })], { catalogComplete: true }).verdict).toBe("blockiert");
    expect(reviewCatalogProduct(product({ id: "p2", defaultPriceId: null }), [], { catalogComplete: true }).blockers).toContain("Kein Standardpreis hinterlegt");
    expect(
      reviewCatalogProduct(product({ id: "p3" }), [price({ id: "price_default", active: false, isDefault: true })], { catalogComplete: true }).blockers,
    ).toContain("Standardpreis ist inaktiv");
    expect(reviewCatalogProduct(product({ id: "p4" }), [], { catalogComplete: true }).blockers).toContain(
      "Standardpreis nicht im erfassten Preiskatalog",
    );
  });

  it("trennt blockierende Befunde von Warnungen", () => {
    const review = reviewCatalogProduct(
      product({
        id: "prod_mixed",
        issues: [
          "Mehrere aktive Preise fuer EUR einmalig: Preiskollision klaeren",
          "Steuerbehandlung mindestens einer Preisvariante pruefen",
          "Erstellzeitpunkt fehlt; zeitliche Gueltigkeit nicht belegbar: price_x",
        ],
      }),
      [price({ id: "price_default", isDefault: true })],
      { catalogComplete: true },
    );
    expect(review.verdict).toBe("blockiert");
    expect(review.blockers.join(" ")).toContain("Preiskollision");
    expect(review.warnings.join(" ")).toContain("Steuerbehandlung");
    expect(review.warnings.join(" ")).toContain("Erstellzeitpunkt fehlt");
    expect(review.eligible).toBe(false);
  });

  it("laesst reine Warnungen eine Freigabe zu, verlangt aber Pruefung", () => {
    const review = reviewCatalogProduct(
      product({ id: "prod_warn", issues: ["Steuerbehandlung mindestens einer Preisvariante pruefen"] }),
      [price({ id: "price_default", isDefault: true })],
      { catalogComplete: true },
    );
    expect(review).toMatchObject({ verdict: "pruefen", eligible: true });
    expect(review.warnings.length).toBe(1);
  });

  it("filtert nach Suche ohne Umlautabhaengigkeit und sortiert blockierte Produkte nach oben", () => {
    const products = [
      product({ id: "prod_a", name: "Grüne Karte" }),
      product({ id: "prod_b", name: "Gruener Plan", issues: ["Keine aktive Preisvariante"] }),
      product({ id: "prod_c", name: "Roter Plan" }),
    ];
    const prices = [price({ id: "price_default", isDefault: true })];
    const result = filterCatalogProducts(products, prices, { search: "gru" }, { catalogComplete: true });
    expect(result.rows.map(row => row.id)).toEqual(["prod_b", "prod_a"]);
    expect(result.matched).toBe(2);
    expect(result.facets.total).toBe(3);
  });

  it("liefert Facetten und respektiert aktiv/inaktiv, Befunde und Limit", () => {
    const products = [
      product({ id: "prod_1", name: "Alpha" }),
      product({ id: "prod_2", name: "Beta", active: false }),
      product({ id: "prod_3", name: "Gamma", issues: ["Keine aktive Preisvariante"] }),
    ];
    const prices = [price({ id: "price_default", isDefault: true })];
    const active = filterCatalogProducts(products, prices, { activeOnly: true }, { catalogComplete: true });
    expect(active.rows.map(row => row.id)).toEqual(["prod_3", "prod_1"]);
    // prod_2 ist inaktiv und damit ebenfalls blockiert, prod_3 hat keine aktive Preisvariante.
    expect(active.facets).toMatchObject({ total: 3, active: 2, inactive: 1, withIssues: 1, blockiert: 2 });

    const limited = filterCatalogProducts(products, prices, { limit: 1 }, { catalogComplete: true });
    expect(limited.rows.length).toBe(1);
    expect(limited.truncated).toBe(true);
    expect(limited.matched).toBe(3);

    const withIssues = filterCatalogProducts(products, prices, { onlyWithIssues: true }, { catalogComplete: true });
    expect(withIssues.rows.map(row => row.id)).toEqual(["prod_3"]);
  });

  it("filtert nach Waehrung und Hoechstpreis nur bei belegtem Standardpreis", () => {
    const products = [
      product({ id: "prod_eur", name: "Euro" , defaultPriceId: "price_eur" }),
      product({ id: "prod_usd", name: "Dollar", defaultPriceId: "price_usd" }),
      product({ id: "prod_none", name: "Ohne Preis", defaultPriceId: "price_missing" }),
    ];
    const prices = [
      price({ id: "price_eur", currency: "eur", amountMinor: 900 }),
      price({ id: "price_usd", currency: "usd", amountMinor: 5000 }),
    ];
    const eur = filterCatalogProducts(products, prices, { currency: "eur" }, { catalogComplete: true });
    expect(eur.rows.map(row => row.id)).toEqual(["prod_eur"]);
    const cheap = filterCatalogProducts(products, prices, { maxPriceMinor: 1000 }, { catalogComplete: true });
    expect(cheap.rows.map(row => row.id)).toEqual(["prod_eur"]);
  });

  it("nennt bei leerem Ergebnis und Teilkatalog einen ehrlichen Hinweis", () => {
    const products = [product({ id: "prod_x", name: "Nur dieses" })];
    const none = filterCatalogProducts(products, [price({ id: "price_default", isDefault: true })], { search: "gibtsnicht" }, { catalogComplete: true });
    expect(none.rows).toEqual([]);
    expect(none.note).toContain("Keine Produkte entsprechen den Filtern");

    const partial = filterCatalogProducts(products, [price({ id: "price_default", isDefault: true })], {}, { catalogComplete: false });
    expect(partial.note).toContain("Katalog unvollstaendig");
    expect(partial.rows.every(row => row.verdict === "blockiert")).toBe(true);
  });

  it("normalisiert Suchtext fuer Umlaute und Leerraum", () => {
    expect(normalizeCatalogSearch("  Grüße  ÄÖÜ ")).toBe("grusse aou");
  });
});
