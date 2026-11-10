/**
 * Digistore24 IPN-Handler (Block 2): der oeffentliche Webhook-Pfad
 * POST /api/v1/webhooks/digistore24 hatte bisher keine direkten Tests —
 * getestet war nur die reine Ledger-Logik. Hier wird das Verhalten des
 * Handlers selbst abgesichert: Fail-closed ohne Secret, timing-safe
 * Signaturpruefung inklusive Passphrasen-Rotation, Idempotenz bei
 * Doppel-IPNs, Aggregation von Umsatz/Conversions, ehrliche 503 bei
 * DB-Ausfall und Protokoll-Hygiene (keine Kaeuferdaten im Ledger).
 *
 * Der DB-Zugriff laeuft ueber den deterministischen Test-Hook
 * setDigistore24IpnDbForTests, weil vitest mit `isolate: false` laeuft und
 * file-uebergreifende Modul-/Mock-Zustaende sonst zufaellig durchschlagen.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import type { Request, Response } from "express";
import {
  buildIpnSignature,
  handleDigistore24Ipn,
  setDigistore24IpnDbForTests,
} from "../server/digistore24-ipn";
import {
  getRevenueWebhookRuntimeStatus,
  resetRevenueWebhookRuntimeForTests,
} from "../server/revenue-webhook-runtime";

const PASSPHRASE = "test-passphrase";

type RecordedInsert = { table: unknown; values: Record<string, unknown>; conflictTarget?: unknown };

/** Minimaler Drizzle-Transaction-Double: zeichnet Schreibversuche auf. */
function createTx(options: { existingOrderKey?: boolean } = {}) {
  const inserts: RecordedInsert[] = [];
  const executes: unknown[] = [];

  const tx = {
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          const entry: RecordedInsert = { table, values };
          return {
            onConflictDoNothing(config?: { target?: unknown }) {
              if (config?.target) entry.conflictTarget = config.target;
              inserts.push(entry);
              const isConversion = Boolean(
                (values as { orderKey?: unknown }).orderKey,
              );
              return {
                returning: async () =>
                  isConversion
                    ? options.existingOrderKey
                      ? []
                      : [{ id: 1 }]
                    : [],
              };
            },
          };
        },
      };
    },
    execute: async (statement: unknown) => {
      executes.push(statement);
      return [];
    },
  };

  return { tx, inserts, executes };
}

function createDb(options: { existingOrderKey?: boolean } = {}) {
  const { tx, inserts, executes } = createTx(options);
  const transaction = vi.fn(
    async (callback: (t: typeof tx) => Promise<unknown>) => callback(tx),
  );
  return { db: { transaction } as never, transaction, inserts, executes };
}

function createResponse() {
  const headers: Record<string, string> = {};
  const response = {
    statusCode: 0,
    body: undefined as unknown,
    contentType: undefined as string | undefined,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
    type(value: string) {
      response.contentType = value;
      return response;
    },
    send(payload: unknown) {
      response.body = payload;
      return response;
    },
    headers,
  };
  return response;
}

function signedFields(
  fields: Record<string, string>,
  passphrase: string = PASSPHRASE,
): Record<string, string> {
  return { ...fields, sha_sign: buildIpnSignature(fields, passphrase) };
}

async function invoke(body: Record<string, unknown>) {
  const res = createResponse();
  await handleDigistore24Ipn({ body } as unknown as Request, res as unknown as Response);
  return res;
}

const SALE = {
  order_id: "D24-1001",
  event: "sale",
  product_id: "4711",
  product_name: "CyberSarah Pro",
  amount: "49.90",
  commission: "24.95",
  currency: "EUR",
};

let previousSecret: string | undefined;

beforeEach(() => {
  previousSecret = process.env.DIGISTORE24_IPN_SECRET;
  process.env.DIGISTORE24_IPN_SECRET = PASSPHRASE;
  delete process.env.DIGISTORE24_IPN_PASSPHRASE;
  resetRevenueWebhookRuntimeForTests();
});

afterEach(() => {
  setDigistore24IpnDbForTests(null);
  if (previousSecret === undefined) delete process.env.DIGISTORE24_IPN_SECRET;
  else process.env.DIGISTORE24_IPN_SECRET = previousSecret;
  resetRevenueWebhookRuntimeForTests();
});

afterAll(() => {
  // isolate:false: Umgebungs- und Seam-Zustand nicht in Nachbardateien leaken.
  setDigistore24IpnDbForTests(null);
  resetRevenueWebhookRuntimeForTests();
});

describe("Digistore24 IPN — Fail-closed und Signatur", () => {
  it("antwortet ohne konfiguriertes Secret mit 503 und schreibt nichts", async () => {
    delete process.env.DIGISTORE24_IPN_SECRET;
    const { db, transaction } = createDb();
    setDigistore24IpnDbForTests((async () => db) as never);

    const res = await invoke(signedFields(SALE));

    expect(res.statusCode).toBe(503);
    expect(transaction).not.toHaveBeenCalled();
    expect(getRevenueWebhookRuntimeStatus().digistore24.lastFailureKind).toBe("configuration");
  });

  it("weist eine falsche Signatur mit 401 ab", async () => {
    const { db, transaction } = createDb();
    setDigistore24IpnDbForTests((async () => db) as never);

    const res = await invoke(signedFields(SALE, "falsche-passphrase"));

    expect(res.statusCode).toBe(401);
    expect(transaction).not.toHaveBeenCalled();
    expect(getRevenueWebhookRuntimeStatus().digistore24.lastFailureKind).toBe("signature_invalid");
  });

  it("weist eine formal ungueltige sha_sign ohne Timing-Vergleich ab", async () => {
    const { db, transaction } = createDb();
    setDigistore24IpnDbForTests((async () => db) as never);

    const res = await invoke({ ...SALE, sha_sign: "deadbeef" });

    expect(res.statusCode).toBe(401);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("akzeptiert eine Signatur mit einem Kandidaten aus der Rotation", async () => {
    process.env.DIGISTORE24_IPN_SECRET = `alte-passphrase, ${PASSPHRASE}`;
    const { db } = createDb();
    setDigistore24IpnDbForTests((async () => db) as never);

    const res = await invoke(signedFields(SALE));

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK recorded");
  });

  it("verraet die verwendete Passphrase nur als Fingerabdruck", async () => {
    const { db } = createDb();
    setDigistore24IpnDbForTests((async () => db) as never);

    const res = await invoke(signedFields(SALE));

    const fingerprint = res.headers["x-ipn-secret-fingerprint"];
    expect(fingerprint).toHaveLength(8);
    expect(fingerprint).not.toContain(PASSPHRASE);
  });
});

describe("Digistore24 IPN — Payload-Validierung", () => {
  beforeEach(() => {
    const { db } = createDb();
    setDigistore24IpnDbForTests((async () => db) as never);
  });

  it("lehnt einen Event ohne order_id mit 400 ab", async () => {
    const fields: Record<string, string> = { ...SALE };
    delete fields.order_id;

    const res = await invoke(signedFields(fields));

    expect(res.statusCode).toBe(400);
    expect((res.body as { detail: string }).detail).toBe("order_id fehlt.");
    expect(getRevenueWebhookRuntimeStatus().digistore24.lastFailureKind).toBe("invalid_payload");
  });

  it("lehnt unlesbare Betraege mit 400 ab", async () => {
    const res = await invoke(signedFields({ ...SALE, amount: "keine-zahl" }));

    expect(res.statusCode).toBe(400);
    expect((res.body as { detail: string }).detail).toBe("Ungültiger Betrag.");
    expect(getRevenueWebhookRuntimeStatus().digistore24.lastFailureKind).toBe("invalid_amount");
  });

  it("faellt bei unbekannter Waehrung auf EUR zurueck", async () => {
    const { db, inserts } = createDb();
    setDigistore24IpnDbForTests((async () => db) as never);

    await invoke(signedFields({ ...SALE, currency: "euro" }));

    const conversion = inserts.find((entry) => "orderKey" in entry.values);
    expect(conversion?.values.currency).toBe("EUR");
  });
});

describe("Digistore24 IPN — Buchung und Idempotenz", () => {
  it("legt unbekannte Produkte an und aggregiert Umsatz plus Conversions", async () => {
    const { db, inserts, executes, transaction } = createDb();
    setDigistore24IpnDbForTests((async () => db) as never);

    const res = await invoke(signedFields(SALE));

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK recorded");
    expect(transaction).toHaveBeenCalledTimes(1);

    const product = inserts.find((entry) => "slug" in entry.values);
    expect(product?.values.slug).toBe("4711");
    expect(product?.values.platform).toBe("digistore24");

    const conversion = inserts.find((entry) => "orderKey" in entry.values);
    expect(conversion?.values).toMatchObject({
      productSlug: "4711",
      eventType: "sale",
      amountCents: 4990,
      commissionCents: 2495,
      currency: "EUR",
    });

    // Produkt-Aggregat + Tagesstatistik
    expect(executes).toHaveLength(2);
    expect(getRevenueWebhookRuntimeStatus().digistore24.lastSuccessAt).not.toBeNull();
  });

  it("quittiert ein Doppel-IPN mit 200 duplicate statt doppelt zu zaehlen", async () => {
    const { db, executes } = createDb({ existingOrderKey: true });
    setDigistore24IpnDbForTests((async () => db) as never);

    const res = await invoke(signedFields(SALE));

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK duplicate");
    // Keine Aggregat-Updates bei bereits verbuchtem Event.
    expect(executes).toHaveLength(0);
  });

  it("bildet Refunds und Chargebacks mit negativem Delta ab", async () => {
    for (const [event, expected] of [
      ["refund", -2495],
      ["chargeback", -2495],
    ] as const) {
      resetRevenueWebhookRuntimeForTests();
      const { db, inserts, executes } = createDb();
      setDigistore24IpnDbForTests((async () => db) as never);

      const res = await invoke(
        signedFields({ ...SALE, order_id: `D24-${event}`, event }),
      );

      expect(res.statusCode).toBe(200);
      const conversion = inserts.find((entry) => "orderKey" in entry.values);
      expect(conversion?.values.commissionCents).toBe(expected);
      expect(conversion?.values.eventType).toBe(event);
      expect(executes).toHaveLength(2);
    }
  });

  it("speichert nur eine minimierte Payload ohne Kaeuferdaten", async () => {
    const { db, inserts } = createDb();
    setDigistore24IpnDbForTests((async () => db) as never);

    await invoke(
      signedFields({
        ...SALE,
        buyer_email: "kunde@example.com",
        buyer_name: "Max Mustermann",
        buyer_street: "Teststrasse 1",
      }),
    );

    const conversion = inserts.find((entry) => "orderKey" in entry.values);
    const payload = conversion?.values.rawPayload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("buyer_email");
    expect(payload).not.toHaveProperty("buyer_name");
    expect(payload).not.toHaveProperty("buyer_street");
    expect(payload).toMatchObject({ order_id: "D24-1001", event: "sale" });
  });

  it("hasht die Kaeufer-E-Mail, statt sie im Klartext abzulegen", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
    const { db, inserts } = createDb();
    setDigistore24IpnDbForTests((async () => db) as never);

    await invoke(signedFields({ ...SALE, buyer_email: "Kunde@Example.com" }));

    const conversion = inserts.find((entry) => "orderKey" in entry.values);
    const hash = conversion?.values.buyerEmailHash as string;
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("kunde");
    const expected = crypto
      .createHmac("sha256", process.env.JWT_SECRET as string)
      .update("kunde@example.com")
      .digest("hex");
    expect(hash).toBe(expected);
  });
});

describe("Digistore24 IPN — ehrliche Fehlerpfade", () => {
  it("antwortet mit 503, wenn die Datenbank nicht erreichbar ist", async () => {
    setDigistore24IpnDbForTests((async () => {
      throw new Error("connection refused");
    }) as never);

    const res = await invoke(signedFields(SALE));

    expect(res.statusCode).toBe(503);
    expect((res.body as { detail: string }).detail).toBe("Datenbank nicht verfügbar.");
    expect(getRevenueWebhookRuntimeStatus().digistore24.lastFailureKind).toBe("database");
  });

  it("antwortet mit 503, wenn getDb nichts liefert", async () => {
    setDigistore24IpnDbForTests((async () => null) as never);

    const res = await invoke(signedFields(SALE));

    expect(res.statusCode).toBe(503);
    expect(getRevenueWebhookRuntimeStatus().digistore24.lastFailureKind).toBe("database");
  });

  it("verschweigt bei Transaktionsfehlern interne Details", async () => {
    const db = {
      transaction: async () => {
        throw new Error('relation "conversion_events" does not exist');
      },
    };
    setDigistore24IpnDbForTests((async () => db) as never);

    const res = await invoke(signedFields(SALE));

    expect(res.statusCode).toBe(503);
    const detail = (res.body as { detail: string }).detail;
    expect(detail).toBe("Conversion vorübergehend nicht speicherbar.");
    expect(detail).not.toContain("conversion_events");
    expect(getRevenueWebhookRuntimeStatus().digistore24.lastFailureKind).toBe("database");
  });
});
