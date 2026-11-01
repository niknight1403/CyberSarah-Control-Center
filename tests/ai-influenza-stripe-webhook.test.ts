import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AiInfluenzaStripeError, verarbeiteWebhook } from "../server/ai-influenza-stripe";

describe("AI-Influenza Webhook: Fehlerklassen", () => {
  const alt = { ...process.env };
  beforeEach(() => {
    delete process.env.AI_INFLUENZA_STRIPE_WEBHOOK_SECRET;
  });
  afterEach(() => {
    process.env = { ...alt };
  });

  it("liefert 400 bei fehlender Signatur, auch ohne konfiguriertes Secret", async () => {
    await expect(verarbeiteWebhook(Buffer.from("{}"), undefined)).rejects.toMatchObject({ status: 400 });
  });

  it("liefert 500 nur bei fehlender Konfiguration, wenn eine Signatur vorliegt", async () => {
    const err = await verarbeiteWebhook(Buffer.from("{}"), "t=1,v1=abc").catch((e) => e);
    expect(err).toBeInstanceOf(AiInfluenzaStripeError);
    expect(err.status).toBe(500);
  });
});
