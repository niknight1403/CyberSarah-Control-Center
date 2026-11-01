/**
 * Stripe Overview API Route — for mobile app + dashboard
 */
import { Router } from "express";
import { getStripeClient } from "../lib/stripeClient";

const router = Router();

// GET /api/stripe/overview
router.get("/stripe/overview", async (_req, res) => {
  try {
    const stripe = getStripeClient();
    if (!stripe) {
      res.json({ connected: false, error: "Kein Stripe-Client", products: [], balance: 0 });
      return;
    }

    const [products, balance, prices] = await Promise.all([
      stripe.products.list({ limit: 30, active: true }),
      stripe.balance.retrieve(),
      stripe.prices.list({ limit: 50, active: true }),
    ]);

    const produktListe = products.data.map(p => {
      const price = prices.data.find(pr => pr.product === p.id);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        active: p.active,
        images: p.images,
        metadata: p.metadata,
        price: price ? { id: price.id, currency: price.currency, unitAmount: price.unit_amount } : null,
        created: new Date(p.created * 1000).toISOString(),
      };
    });

    res.json({
      connected: true,
      products: produktListe,
      balance: {
        available: balance.available.map(b => ({ amount: b.amount, currency: b.currency })),
        pending: balance.pending.map(b => ({ amount: b.amount, currency: b.currency })),
      },
      totalProducts: products.data.length,
      totalPrices: prices.data.length,
    });
  } catch (err) {
    res.status(500).json({ connected: false, error: err instanceof Error ? err.message : "Unbekannter Fehler" });
  }
});

// GET /api/stripe/products
router.get("/stripe/products", async (_req, res) => {
  try {
    const stripe = getStripeClient();
    if (!stripe) {
      res.json({ products: [] });
      return;
    }

    const [products, prices] = await Promise.all([
      stripe.products.list({ limit: 100, active: true }),
      stripe.prices.list({ limit: 100, active: true }),
    ]);

    const produktListe = products.data.map(p => {
      const price = prices.data.find(pr => pr.product === p.id);
      return {
        id: p.id,
        name: p.name,
        description: p.description?.substring(0, 200) ?? "",
        images: p.images,
        price: price ? { id: price.id, currency: price.currency, unitAmount: price.unit_amount } : null,
        url: price?.id ? `https://buy.stripe.com/${price.id}` : null,
      };
    });

    res.json({ products: produktListe });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unbekannter Fehler" });
  }
});

// GET /api/stripe/balance
router.get("/stripe/balance", async (_req, res) => {
  try {
    const stripe = getStripeClient();
    if (!stripe) {
      res.json({ available: [], pending: [] });
      return;
    }
    const balance = await stripe.balance.retrieve();
    res.json({
      available: balance.available.map(b => ({ amount: b.amount, currency: b.currency })),
      pending: balance.pending.map(b => ({ amount: b.amount, currency: b.currency })),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unbekannter Fehler" });
  }
});

export default router;
