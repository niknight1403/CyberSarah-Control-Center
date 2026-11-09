/**
 * Digistore24-IPN: echter HTTP-E2E-Test gegen den laufenden Handler.
 *
 * Kein Netzwerk zu Digistore24, kein Live-Key, keine Produktionsdaten. Der
 * Test startet einen Express-Server mit demselben Handler, den der Betrieb
 * unter POST /api/v1/webhooks/digistore24 mountet, gegen eine Wegwerf-Postgres
 * und prueft die komplette Kette:
 *
 *   1. Route erreichbar, falsche Methode sauber abgewiesen
 *   2. ohne Signatur -> 401, keine Buchung
 *   3. Signatur mit falschem Geheimnis -> 401, keine Buchung
 *   4. korrekt signierter Verkauf -> 200 "OK recorded" + Aggregation
 *   5. identische Zustellung erneut -> 200 "OK duplicate", keine Doppelbuchung
 *   6. signierte Erstattung -> 200, Aggregation laeuft zurueck
 *   7. fehlende order_id -> 400, unlesbarer Betrag -> 400
 *   8. Secret fehlt -> 503 und die Buchung bleibt aus (fail-closed)
 *
 * Aufruf: npx tsx scripts/test-digistore-ipn-e2e.ts
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import express from "express";
import { Pool } from "pg";

const DB_URL = process.env.IPN_E2E_DATABASE_URL ?? "";
const PASSPHRASE = "e2e_ipn_passphrase_not_a_production_secret";
const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
  if (!ok) throw new Error(`Testfall fehlgeschlagen: ${name}`);
}

/** Digistore24-Signatur: SHA512 ueber sortierte Parameterwerte + Passphrase. */
function sign(fields: Record<string, string>, passphrase: string): string {
  const keys = Object.keys(fields).filter((k) => k !== "sha_sign").sort();
  return crypto.createHash("sha512").update(keys.map((k) => fields[k]).join("") + passphrase, "utf8").digest("hex");
}

function urlencode(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

async function main(): Promise<void> {
  const target = new URL(DB_URL);
  const localOnly =
    target.protocol === "postgresql:" &&
    ["127.0.0.1", "localhost"].includes(target.hostname) &&
    target.pathname === "/digistore_ipn_ci";
  if (!localOnly) throw new Error("Safety gate: Test nur gegen lokale Wegwerf-DB digistore_ipn_ci.");

  const pool = new Pool({ connectionString: DB_URL, max: 2 });
  const ddl = await readFile("tests/fixtures/digistore24-ipn-test-schema.sql", "utf8");
  for (const stmt of ddl.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
    await pool.query(stmt);
  }
  await pool.query("TRUNCATE conversion_events RESTART IDENTITY");
  await pool.query("TRUNCATE affiliate_products RESTART IDENTITY");
  await pool.query("TRUNCATE revenue_daily_stats RESTART IDENTITY");

  process.env.DATABASE_URL = DB_URL;
  process.env.DIGISTORE24_IPN_SECRET = PASSPHRASE;
  process.env.D24_CUSTOMER_HASH_SECRET = "e2e_hash_secret";

  const { handleDigistore24Ipn } = await import("../server/digistore24-ipn");

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.post("/api/v1/webhooks/digistore24", (req, res) => void handleDigistore24Ipn(req, res));
  app.get("/api/v1/webhooks/digistore24", (_req, res) => res.status(404).json({ error: "Not found" }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server konnte nicht starten.");
  const base = `http://127.0.0.1:${address.port}/api/v1/webhooks/digistore24`;

  const send = async (body: string, contentType = "application/x-www-form-urlencoded") => {
    const response = await fetch(base, { method: "POST", headers: { "content-type": contentType }, body });
    return {
      status: response.status,
      text: (await response.text()).trim(),
      fingerprint: response.headers.get("x-ipn-secret-fingerprint") ?? "",
    };
  };

  const counts = async () => {
    const events = await pool.query("SELECT count(*)::int AS n FROM conversion_events");
    const stats = await pool.query('SELECT "conversions"::int AS c, "revenueCents"::int AS r FROM revenue_daily_stats');
    const product = await pool.query('SELECT "conversionCount"::int AS c, "revenueCents"::int AS r FROM affiliate_products WHERE slug=$1', ["cybersarah-e2e-produkt"]);
    return {
      events: events.rows[0].n as number,
      conversions: (stats.rows[0]?.c ?? 0) as number,
      revenue: (stats.rows[0]?.r ?? 0) as number,
      productConversions: (product.rows[0]?.c ?? 0) as number,
      productRevenue: (product.rows[0]?.r ?? 0) as number,
    };
  };

  try {
    console.log("\n[1] Route und Methoden");
    const getResponse = await fetch(base, { method: "GET" });
    record("GET wird abgewiesen", getResponse.status === 404, `HTTP ${getResponse.status}`);

    console.log("\n[2] Signaturpruefung (fail-closed)");
    const unsigned = await send(urlencode({ order_id: "E2E-NO-SIGN", event: "sale", amount: "19.99" }));
    record("ohne sha_sign -> 401", unsigned.status === 401, `HTTP ${unsigned.status}`);
    const wrongKey = { order_id: "E2E-WRONG-KEY", event: "sale", amount: "19.99" };
    const forged = await send(urlencode({ ...wrongKey, sha_sign: sign(wrongKey, "falsche_passphrase") }));
    record("fremdes Geheimnis -> 401", forged.status === 401, `HTTP ${forged.status}`);
    const garbage = await send(urlencode({ order_id: "E2E-GARBAGE", event: "sale", sha_sign: "nicht-hex" }));
    record("unbrauchbare Signatur -> 401", garbage.status === 401, `HTTP ${garbage.status}`);
    const afterAuth = await counts();
    record("keine Buchung aus abgewiesenen Events", afterAuth.events === 0, `${afterAuth.events} Event(s)`);

    console.log("\n[3] Signierter Verkauf");
    const sale = {
      order_id: "E2E-ORDER-1",
      event: "sale",
      product_id: "cybersarah-e2e-produkt",
      product_name: "CyberSarah E2E Produkt",
      amount: "19.99",
      commission: "9.99",
      currency: "EUR",
      buyer_email: "e2e@example.invalid",
    };
    const saleResponse = await send(urlencode({ ...sale, sha_sign: sign(sale, PASSPHRASE) }));
    record("gueltige Signatur -> 200 recorded", saleResponse.status === 200 && saleResponse.text === "OK recorded", `HTTP ${saleResponse.status} "${saleResponse.text}"`);
    const afterSale = await counts();
    record(
      "Aggregation genau einmal gebucht",
      afterSale.events === 1 && afterSale.conversions === 1 && afterSale.revenue === 999 && afterSale.productConversions === 1,
      `events=${afterSale.events} conversions=${afterSale.conversions} revenue=${afterSale.revenue} product=${afterSale.productConversions}/${afterSale.productRevenue}`,
    );
    const stored = await pool.query('SELECT "buyerEmailHash","rawPayload" FROM conversion_events WHERE "orderKey" LIKE $1', ["%E2E-ORDER-1%"]);
    record(
      "Kaeufermail nur gehasht, Rohdaten minimiert",
      Boolean(stored.rows[0]?.buyerEmailHash) && !JSON.stringify(stored.rows[0]?.rawPayload ?? {}).includes("e2e@example.invalid"),
      `hash=${String(stored.rows[0]?.buyerEmailHash).slice(0, 12)}…`,
    );

    console.log("\n[4] Idempotenz bei Doppelzustellung");
    const duplicate = await send(urlencode({ ...sale, sha_sign: sign(sale, PASSPHRASE) }));
    record("zweite Zustellung -> 200 duplicate", duplicate.status === 200 && duplicate.text === "OK duplicate", `HTTP ${duplicate.status} "${duplicate.text}"`);
    const afterDuplicate = await counts();
    record(
      "keine Doppelbuchung",
      afterDuplicate.events === afterSale.events && afterDuplicate.conversions === afterSale.conversions && afterDuplicate.revenue === afterSale.revenue,
      `events=${afterDuplicate.events} revenue=${afterDuplicate.revenue}`,
    );

    console.log("\n[5] Signierte Erstattung");
    const refund = { order_id: "E2E-ORDER-1", event: "refund", product_id: "cybersarah-e2e-produkt", amount: "19.99", commission: "9.99", currency: "EUR" };
    const refundResponse = await send(urlencode({ ...refund, sha_sign: sign(refund, PASSPHRASE) }));
    record("Erstattung -> 200 recorded", refundResponse.status === 200 && refundResponse.text === "OK recorded", `HTTP ${refundResponse.status} "${refundResponse.text}"`);
    const afterRefund = await counts();
    record(
      "Erstattung rechnet zurueck",
      afterRefund.conversions === 0 && afterRefund.revenue === 0 && afterRefund.productConversions === 0 && afterRefund.productRevenue === 0 && afterRefund.events === 2,
      `events=${afterRefund.events} conversions=${afterRefund.conversions} revenue=${afterRefund.revenue}`,
    );

    console.log("\n[6] Fehlerhafte Nutzlast");
    const noOrder = { event: "sale", amount: "19.99" };
    const missingOrder = await send(urlencode({ ...noOrder, sha_sign: sign(noOrder, PASSPHRASE) }));
    record("fehlende order_id -> 400", missingOrder.status === 400, `HTTP ${missingOrder.status}`);
    const badAmount = { order_id: "E2E-BAD-AMOUNT", event: "sale", amount: "abc" };
    const invalidAmount = await send(urlencode({ ...badAmount, sha_sign: sign(badAmount, PASSPHRASE) }));
    record("unlesbarer Betrag -> 400", invalidAmount.status === 400, `HTTP ${invalidAmount.status}`);

    console.log("\n[7] Fail-closed ohne Secret");
    const before = await counts();
    delete process.env.DIGISTORE24_IPN_SECRET;
    const noSecret = await send(urlencode({ ...sale, order_id: "E2E-ORDER-NOSECRET", sha_sign: sign({ ...sale, order_id: "E2E-ORDER-NOSECRET" }, PASSPHRASE) }));
    record("fehlendes Secret -> 503", noSecret.status === 503, `HTTP ${noSecret.status}`);
    const after = await counts();
    record("keine Buchung ohne Secret", after.events === before.events, `${after.events} Event(s)`);

    console.log("\n[8] Passphrasen-Rotation");
    const SECOND = "zweite_passphrase_nach_wechsel";
    process.env.DIGISTORE24_IPN_SECRET = `${PASSPHRASE},${SECOND}`;
    const rotated = { ...sale, order_id: "E2E-ORDER-ROTATION" };
    const rotatedResponse = await send(urlencode({ ...rotated, sha_sign: sign(rotated, SECOND) }));
    record(
      "zweiter Kandidat wird akzeptiert",
      rotatedResponse.status === 200 && rotatedResponse.text === "OK recorded",
      `HTTP ${rotatedResponse.status} "${rotatedResponse.text}"`,
    );
    const expectedFingerprint = (await import("../lib/digistore24-ipn-config")).ipnSecretFingerprint(SECOND);
    record(
      "Antwort nennt den passenden Fingerabdruck",
      rotatedResponse.fingerprint === expectedFingerprint,
      `header=${rotatedResponse.fingerprint || "leer"} erwartet=${expectedFingerprint}`,
    );
    const unknown = { ...sale, order_id: "E2E-ORDER-UNKNOWN" };
    const unknownResponse = await send(urlencode({ ...unknown, sha_sign: sign(unknown, "nicht_konfigurierte_passphrase") }));
    record("unbekannter dritter Kandidat -> 401", unknownResponse.status === 401, `HTTP ${unknownResponse.status}`);

    console.log(`\nErgebnis: ${checks.length} Pruefungen, ${checks.filter((c) => c.ok).length} bestanden, 0 fehlgeschlagen.`);
    console.log("Hinweis: Dies belegt den Code-Pfad. Ob die Produktion bucht, haengt allein vom gesetzten IPN-Secret in Render ab.");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
}

main().catch((error) => {
  console.error("\nFEHLGESCHLAGEN:", error instanceof Error ? error.message : error);
  process.exit(1);
});
