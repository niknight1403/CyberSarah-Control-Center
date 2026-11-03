import { describe, it, expect, vi } from "vitest";
import { runSalesCatalogStep, type StripeCatalogExecutor } from "../server/ai-influenza-sales-catalog";

function fakeExecutor(existingLookupKeys: string[] = []): StripeCatalogExecutor & {
  products: Record<string, unknown>[];
  prices: Record<string, unknown>[];
  productKeys: string[];
  priceKeys: string[];
  lookedUp: string[];
} {
  const products: Record<string, unknown>[] = [];
  const prices: Record<string, unknown>[] = [];
  const productKeys: string[] = [];
  const priceKeys: string[] = [];
  const lookedUp: string[] = [];
  return {
    lookedUp,
    async findPriceByLookupKey(lookupKey) {
      lookedUp.push(lookupKey);
      if (!existingLookupKeys.includes(lookupKey)) return null;
      return { id: `price_bestehend_${lookupKey}` };
    },
    products,
    prices,
    productKeys,
    priceKeys,
    async createProduct(payload, options) {
      products.push(payload);
      productKeys.push(options.idempotencyKey);
      return { id: `prod_${products.length}` };
    },
    async createPrice(payload, options) {
      prices.push(payload);
      priceKeys.push(options.idempotencyKey);
      return { id: `price_${prices.length}` };
    },
  };
}

const AUTOCREATE = { STRIPE_SECRET_KEY: "sk_test_dummy", AI_INFLUENZA_CATALOG_AUTOCREATE: "1" };

describe("runSalesCatalogStep", () => {
  it("bleibt Trockenlauf ohne Freigabe, auch mit Schluessel", async () => {
    const executor = fakeExecutor();
    const result = await runSalesCatalogStep({ env: { STRIPE_SECRET_KEY: "sk_test_dummy" }, executor });
    expect(result.dryRun).toBe(true);
    expect(result.executed).toBe(0);
    expect(executor.products).toHaveLength(0);
    expect(result.blocked).toContain("stripe: AI_INFLUENZA_CATALOG_AUTOCREATE nicht gesetzt, nur Trockenlauf.");
  });

  it("bleibt Trockenlauf ohne Schluessel, auch mit Freigabe", async () => {
    const executor = fakeExecutor();
    const result = await runSalesCatalogStep({ env: { AI_INFLUENZA_CATALOG_AUTOCREATE: "1" }, executor });
    expect(result.dryRun).toBe(true);
    expect(result.blocked).toContain("stripe: STRIPE_SECRET_KEY fehlt, Katalog bleibt unveraendert.");
  });

  it("legt mit Freigabe drei Produkte und drei Preise an", async () => {
    const executor = fakeExecutor();
    const result = await runSalesCatalogStep({ env: AUTOCREATE, executor });
    expect(result.dryRun).toBe(false);
    expect(result.executed).toBe(3);
    expect(result.created.map((row) => row.priceId)).toEqual(["price_1", "price_2", "price_3"]);
    expect(executor.products).toHaveLength(4);
    expect(executor.prices).toHaveLength(4);
    expect(executor.prices[0].product).toBe("prod_1");
    expect(executor.prices[0].lookup_key).toBe("ai-influenza-starter");
    expect(result.created[0].envTarget).toBe("STRIPE_AI_INFLUENZA_PRICE_ID_STARTER");
  });

  it("nutzt stabile Idempotenz-Schluessel fuer Produkt und Preis", async () => {
    const executor = fakeExecutor();
    await runSalesCatalogStep({ env: AUTOCREATE, executor });
    expect(executor.productKeys).toEqual([
      "ai-influenza-catalog-starter-29900-produkt",
      "ai-influenza-catalog-growth-99900-produkt",
      "ai-influenza-catalog-business-249900-produkt",
    ]);
    expect(executor.priceKeys[1]).toBe("ai-influenza-catalog-growth-99900");
  });

  it("ueberspringt bereits verdrahtete Preise", async () => {
    const executor = fakeExecutor();
    const result = await runSalesCatalogStep({
      env: { ...AUTOCREATE, STRIPE_AI_INFLUENZA_PRICE_ID_GROWTH: "price_vorhanden" },
      executor,
    });
    expect(result.executed).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.created.map((row) => row.packageId)).toEqual(["starter", "business"]);
  });

  it("prueft vor dem Anlegen den Lookup-Key und legt nichts doppelt an", async () => {
    const executor = fakeExecutor(["ai-influenza-growth"]);
    const result = await runSalesCatalogStep({ env: AUTOCREATE, executor });
    expect(executor.lookedUp).toEqual(["ai-influenza-starter", "ai-influenza-growth", "ai-influenza-business"]);
    expect(result.executed).toBe(2);
    expect(result.reused).toEqual([
      {
        channel: "stripe",
        packageId: "growth",
        priceId: "price_bestehend_ai-influenza-growth",
        envTarget: "STRIPE_AI_INFLUENZA_PRICE_ID_GROWTH",
      },
    ]);
    expect(executor.products.map((row) => (row.metadata as Record<string, unknown>).packageId)).toEqual([
      "starter",
      "business",
    ]);
  });

  it("meldet Digistore24 als Freigabe- und Blockerfall, statt es zu erzwingen", async () => {
    const executor = fakeExecutor();
    const result = await runSalesCatalogStep({ env: AUTOCREATE, executor });
    expect(result.needsReview).toBe(3);
    expect(result.blocked).toContain("digistore24/starter: DIGISTORE24_API_KEY fehlt.");
  });

  it("bricht bei einem Fehler nicht ab, sondern sammelt Blocker", async () => {
    const executor = fakeExecutor();
    const failing: StripeCatalogExecutor = {
      findPriceByLookupKey: vi.fn().mockResolvedValue(null),
      createProduct: vi.fn().mockResolvedValue({ id: "prod_1" }),
      createPrice: vi
        .fn()
        .mockRejectedValueOnce(new Error("rate_limit"))
        .mockResolvedValue({ id: "price_2" }),
    };
    const result = await runSalesCatalogStep({ env: AUTOCREATE, executor: { ...executor, ...failing } });
    expect(result.error).toBe("rate_limit");
    expect(result.blocked.some((line) => line.includes("stripe/starter: rate_limit"))).toBe(true);
    expect(result.created).toHaveLength(3);
  });
});
