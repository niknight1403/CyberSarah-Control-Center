import { afterEach, describe, expect, it } from "vitest";
import {
  creditPacksForCheckout,
  debitCredits,
  findGrantByPaymentIntent,
  getUserTotalCredits,
  grantCredits,
  grantCreditsDetailed,
  readCreditBalance,
  refundCreditsForCharge,
  refundedTokensForPaymentIntent,
  reserveCredits,
  setCreditLedgerDbForTests,
  settleCredits,
} from "../server/credit-ledger";

/**
 * Das Ledger ist die einzige Wahrheit ueber Guthaben: jede Buchung entscheidet,
 * ob ein zahlender Nutzer laufen darf oder faelschlich ausgesperrt wird, und
 * jeder Fehlerpfad entscheidet, ob Tokens doppelt abgebucht werden.
 *
 * Die Tests ersetzen nur die Verbindung (Repo-Konvention `setXForTests`, weil
 * `vi.mock` unter `isolate: false` in Nachbardateien leckt) und pruefen die
 * Buchungsentscheidungen selbst.
 */

/**
 * Minimaler DB-Doppelgaenger: protokolliert jede Anweisung und liefert die
 * vorgegebenen Ergebnisse der Reihe nach. Ein `Error` im Vorrat wird geworfen.
 */
function useDb(responses: Array<unknown | Error> = []) {
  const calls: Array<{ query: string; result: unknown }> = [];
  const db = {
    execute: async (query: { queryChunks?: unknown[] }) => {
      // Drizzle legt den SQL-Text in StringChunks ab, Parameter stehen separat.
      const text = Array.isArray(query.queryChunks)
        ? query.queryChunks
            .filter((chunk): chunk is { value: string[] } => Boolean(chunk) && typeof chunk === "object" && Array.isArray((chunk as { value?: unknown }).value))
            .map((chunk) => chunk.value.join(""))
            .join("")
        : String(query);
      calls.push({ query: text, result: responses.length > 0 ? responses[0] : [] });
      const next = responses.length > 0 ? responses.shift() : [];
      if (next instanceof Error) throw next;
      return next;
    },
  };
  setCreditLedgerDbForTests((async () => db) as never);
  return { db, calls };
}

/** Kein Datenbankzugriff moeglich (z. B. fehlende DATABASE_URL). */
function useNoDb() {
  setCreditLedgerDbForTests((async () => null) as never);
}

afterEach(() => {
  // Pflicht: der Modulzustand wird mit Nachbardateien geteilt.
  setCreditLedgerDbForTests(null);
});

describe("creditPacksForCheckout", () => {
  it("liefert die kanonischen Pakete in der erwarteten Form", () => {
    const packs = creditPacksForCheckout();
    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) {
      expect(Object.keys(pack).sort()).toEqual(["id", "label", "priceEur", "tokens"]);
      expect(pack.tokens).toBeGreaterThan(0);
      expect(pack.priceEur).toBeGreaterThan(0);
    }
  });

  it("gibt bei jedem Aufruf frische Objekte zurueck (kein geteilter Zustand)", () => {
    const first = creditPacksForCheckout();
    first[0].label = "manipuliert";
    expect(creditPacksForCheckout()[0].label).not.toBe("manipuliert");
  });
});

describe("readCreditBalance", () => {
  it("liest die Summe der Buchungen", async () => {
    const { calls } = useDb([[{ balance: 12_345 }]]);
    await expect(readCreditBalance("user-1")).resolves.toBe(12_345);
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toContain("credit_ledger_entries");
  });

  it("wandelt Textwerte aus der Datenbank in Zahlen", async () => {
    useDb([[{ balance: "4200" }]]);
    await expect(readCreditBalance("user-1")).resolves.toBe(4200);
  });

  it("meldet 0, wenn die Summe leer bleibt", async () => {
    useDb([[{}]]);
    await expect(readCreditBalance("user-1")).resolves.toBe(0);
  });

  it("fragt bei leerem Nutzer nicht ab", async () => {
    const { calls } = useDb([[{ balance: 99 }]]);
    await expect(readCreditBalance("")).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("meldet null statt zu werfen, wenn die Abfrage scheitert", async () => {
    useDb([new Error("connection reset")]);
    await expect(readCreditBalance("user-1")).resolves.toBeNull();
  });

  it("meldet null ohne Datenbankverbindung", async () => {
    useNoDb();
    await expect(readCreditBalance("user-1")).resolves.toBeNull();
  });

  it("ist der Weg hinter getUserTotalCredits", async () => {
    useDb([[{ balance: 777 }]]);
    await expect(getUserTotalCredits("user-1")).resolves.toBe(777);
  });
});

describe("debitCredits", () => {
  it("bucht Verbrauch und meldet Erfolg", async () => {
    const { calls } = useDb([[]]);
    await expect(
      debitCredits({ openId: "u", tokens: 500, reason: "Lauf", executionKey: "run_1" }),
    ).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].query).toContain("credit_ledger_entries");
  });

  it("bucht nichts bei 0 Tokens", async () => {
    const { calls } = useDb([[]]);
    await expect(
      debitCredits({ openId: "u", tokens: 0, reason: "Lauf", executionKey: "run_1" }),
    ).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("rundet angebrochene Tokens auf, statt sie zu verschenken", async () => {
    const { calls } = useDb([[]]);
    await debitCredits({ openId: "u", tokens: 0.2, reason: "Lauf", executionKey: "run_1" });
    expect(calls).toHaveLength(1);
  });

  it("behandelt negative Werte als 0 und bucht nichts", async () => {
    const { calls } = useDb([[]]);
    await expect(
      debitCredits({ openId: "u", tokens: -50, reason: "Lauf", executionKey: "run_1" }),
    ).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("meldet false ohne Datenbankverbindung", async () => {
    useNoDb();
    await expect(
      debitCredits({ openId: "u", tokens: 10, reason: "Lauf", executionKey: "run_1" }),
    ).resolves.toBe(false);
  });

  it("wirft nicht, wenn die Buchung scheitert", async () => {
    useDb([new Error("deadlock detected")]);
    await expect(
      debitCredits({ openId: "u", tokens: 10, reason: "Lauf", executionKey: "run_1" }),
    ).resolves.toBe(false);
  });
});

describe("reserveCredits", () => {
  it("reserviert bei ausreichendem Guthaben", async () => {
    const { calls } = useDb([[{ before: 10_000, booked: 1 }]]);
    await expect(
      reserveCredits({ openId: "u", tokens: 2_500, executionKey: "run_1" }),
    ).resolves.toEqual({ ok: true, balanceTokens: 7_500, reason: null });
    expect(calls[0].query).toContain("pg_advisory_xact_lock");
  });

  it("reserviert 0 Tokens ohne Buchung und meldet den Stand", async () => {
    const { calls } = useDb([[{ balance: 5_000 }]]);
    await expect(
      reserveCredits({ openId: "u", tokens: 0, executionKey: "run_1" }),
    ).resolves.toEqual({ ok: true, balanceTokens: 5_000, reason: null });
    // Nur die Saldoabfrage, keine Reservierungsbuchung.
    expect(calls).toHaveLength(1);
  });

  it("lehnt bei zu wenig Guthaben ab, ohne zu buchen", async () => {
    useDb([[{ before: 100, booked: 0 }]]);
    await expect(
      reserveCredits({ openId: "u", tokens: 2_500, executionKey: "run_1" }),
    ).resolves.toEqual({ ok: false, balanceTokens: 100, reason: "insufficient" });
  });

  it("wertet eine bereits vorhandene Buchung als erteilte Reservierung", async () => {
    // Wiederholte Zustellung: ON CONFLICT DO NOTHING bucht nichts, aber der
    // Schluessel existiert schon — der Lauf darf nicht doppelt abgewiesen werden.
    useDb([[{ before: 9_000, booked: 0 }]]);
    await expect(
      reserveCredits({ openId: "u", tokens: 1_000, executionKey: "run_1" }),
    ).resolves.toEqual({ ok: true, balanceTokens: 9_000, reason: null });
  });

  it("meldet 'unavailable' ohne Datenbankverbindung", async () => {
    useNoDb();
    await expect(
      reserveCredits({ openId: "u", tokens: 1, executionKey: "run_1" }),
    ).resolves.toEqual({ ok: false, balanceTokens: null, reason: "unavailable" });
  });

  it("meldet 'unavailable' statt zu werfen, wenn die Transaktion scheitert", async () => {
    useDb([new Error("lock timeout")]);
    await expect(
      reserveCredits({ openId: "u", tokens: 1, executionKey: "run_1" }),
    ).resolves.toEqual({ ok: false, balanceTokens: null, reason: "unavailable" });
  });

  it("behandelt fehlende Ergebniszeilen als 0 Guthaben", async () => {
    useDb([[]]);
    await expect(
      reserveCredits({ openId: "u", tokens: 10, executionKey: "run_1" }),
    ).resolves.toEqual({ ok: false, balanceTokens: 0, reason: "insufficient" });
  });
});

describe("settleCredits", () => {
  it("gibt nicht verbrauchte Reservierung zurueck", async () => {
    const { calls } = useDb([[], [{ balance: 8_000 }]]);
    await expect(
      settleCredits({ openId: "u", reservedTokens: 3_000, actualTokens: 1_200, executionKey: "run_1" }),
    ).resolves.toBe(8_000);
    expect(calls).toHaveLength(2);
    expect(calls[0].query).toContain("credit_ledger_entries");
  });

  it("zieht Mehrverbrauch nach", async () => {
    const { calls } = useDb([[], [{ balance: 900 }]]);
    await expect(
      settleCredits({ openId: "u", reservedTokens: 1_000, actualTokens: 1_500, executionKey: "run_1" }),
    ).resolves.toBe(900);
    expect(calls).toHaveLength(2);
  });

  it("bucht nichts, wenn Reservierung und Verbrauch gleich sind", async () => {
    const { calls } = useDb([[{ balance: 7_000 }]]);
    await expect(
      settleCredits({ openId: "u", reservedTokens: 1_000, actualTokens: 1_000, executionKey: "run_1" }),
    ).resolves.toBe(7_000);
    expect(calls).toHaveLength(1);
    expect(calls[0].query).not.toContain("INSERT");
  });

  it("meldet null ohne Datenbankverbindung", async () => {
    useNoDb();
    await expect(
      settleCredits({ openId: "u", reservedTokens: 1_000, actualTokens: 200, executionKey: "run_1" }),
    ).resolves.toBeNull();
  });

  it("laesst einen Lauf nicht scheitern, wenn der Abgleich fehlschlaegt", async () => {
    useDb([new Error("write conflict")]);
    await expect(
      settleCredits({ openId: "u", reservedTokens: 1_000, actualTokens: 200, executionKey: "run_1" }),
    ).resolves.toBeNull();
  });
});

describe("grantCreditsDetailed", () => {
  it("meldet eine tatsaechlich angelegte Gutschrift als gebucht", async () => {
    const { calls } = useDb([[{ id: 1 }]]);
    await expect(
      grantCreditsDetailed({ openId: "u", tokens: 250_000, reason: "Stripe", executionKey: "pi_1" }),
    ).resolves.toEqual({ booked: true, duplicate: false });
    expect(calls[0].query).toContain("payment_intent");
  });

  it("erkennt eine Doppelzustellung als Duplikat", async () => {
    useDb([[]]);
    await expect(
      grantCreditsDetailed({ openId: "u", tokens: 250_000, reason: "Stripe", executionKey: "pi_1" }),
    ).resolves.toEqual({ booked: false, duplicate: true });
  });

  it("bucht nichts bei 0 Tokens", async () => {
    const { calls } = useDb([[{ id: 1 }]]);
    await expect(
      grantCreditsDetailed({ openId: "u", tokens: 0, reason: "Stripe", executionKey: "pi_1" }),
    ).resolves.toEqual({ booked: false, duplicate: false });
    expect(calls).toHaveLength(0);
  });

  it("wirft ohne Datenbank, damit der Webhook erneut zustellen laesst", async () => {
    useNoDb();
    await expect(
      grantCreditsDetailed({ openId: "u", tokens: 100, reason: "Stripe", executionKey: "pi_1" }),
    ).rejects.toThrow(/nicht gebucht/);
  });

  it("reicht Datenbankfehler durch (kein stiller Guthabenverlust)", async () => {
    useDb([new Error("constraint violation")]);
    await expect(
      grantCreditsDetailed({ openId: "u", tokens: 100, reason: "Stripe", executionKey: "pi_1" }),
    ).rejects.toThrow(/constraint violation/);
  });

  it("grantCredits ist nur true bei echter Buchung", async () => {
    useDb([[{ id: 1 }], []]);
    await expect(
      grantCredits({ openId: "u", tokens: 100, reason: "Stripe", executionKey: "pi_1" }),
    ).resolves.toBe(true);
    await expect(
      grantCredits({ openId: "u", tokens: 100, reason: "Stripe", executionKey: "pi_1" }),
    ).resolves.toBe(false);
  });
});

describe("findGrantByPaymentIntent", () => {
  it("liefert Nutzer und Tokens der Gutschrift", async () => {
    useDb([[{ user_open_id: "u-1", tokens: 250_000 }]]);
    await expect(findGrantByPaymentIntent("pi_1")).resolves.toEqual({ openId: "u-1", tokens: 250_000 });
  });

  it("meldet null, wenn die Zahlung unbekannt ist", async () => {
    useDb([[]]);
    await expect(findGrantByPaymentIntent("pi_unbekannt")).resolves.toBeNull();
  });

  it("meldet null bei nicht positiven Tokens", async () => {
    useDb([[{ user_open_id: "u-1", tokens: 0 }]]);
    await expect(findGrantByPaymentIntent("pi_1")).resolves.toBeNull();
  });

  it("wirft ohne Datenbank, damit die Erstattung nicht still verloren geht", async () => {
    useNoDb();
    await expect(findGrantByPaymentIntent("pi_1")).rejects.toThrow(/nicht verfuegbar/);
  });
});

describe("refundedTokensForPaymentIntent", () => {
  it("liefert den bereits entzogenen Betrag", async () => {
    useDb([[{ tokens: 125_000 }]]);
    await expect(refundedTokensForPaymentIntent("u-1", "pi_1")).resolves.toBe(125_000);
  });

  it("normalisiert leere und negative Werte auf 0", async () => {
    useDb([[{}], [{ tokens: -5 }]]);
    await expect(refundedTokensForPaymentIntent("u-1", "pi_1")).resolves.toBe(0);
    await expect(refundedTokensForPaymentIntent("u-1", "pi_1")).resolves.toBe(0);
  });

  it("wirft ohne Datenbank", async () => {
    useNoDb();
    await expect(refundedTokensForPaymentIntent("u-1", "pi_1")).rejects.toThrow(/nicht verfuegbar/);
  });
});

describe("refundCreditsForCharge (Gegenbuchung)", () => {
  it("bucht bei vorhandener Gutschrift die Gegenbuchung", async () => {
    const { calls } = useDb([[{ id: 7 }]]);
    const result = await refundCreditsForCharge(
      { chargeId: "ch_1", paymentIntent: "pi_1", paidCents: 2_000, refundedCents: 2_000 },
      {
        grantedTokensByPaymentIntent: async () => ({ openId: "u-1", tokens: 250_000 }),
        refundedTokensByPaymentIntent: async () => 0,
        balanceOf: async () => 900_000,
      },
    );
    expect(result.booked).toBe(true);
    expect(result.tokens).toBe(250_000);
    expect(calls).toHaveLength(1);
  });

  it("schreibt ohne Gutschrift nichts und erklaert warum", async () => {
    const { calls } = useDb([[]]);
    const result = await refundCreditsForCharge(
      { chargeId: "ch_1", paymentIntent: "pi_unbekannt", paidCents: 2_000, refundedCents: 2_000 },
      {
        grantedTokensByPaymentIntent: async () => null,
        refundedTokensByPaymentIntent: async () => 0,
        balanceOf: async () => 0,
      },
    );
    expect(result).toMatchObject({ booked: false, tokens: 0, cappedByBalance: false });
    expect(result.reason).toMatch(/nichts zu erstatten/i);
    expect(calls).toHaveLength(0);
  });

  it("bucht keine zweite Gegenbuchung fuer dieselbe Erstattung", async () => {
    const { calls } = useDb([[]]);
    const result = await refundCreditsForCharge(
      { chargeId: "ch_1", paymentIntent: "pi_1", paidCents: 2_000, refundedCents: 2_000 },
      {
        grantedTokensByPaymentIntent: async () => ({ openId: "u-1", tokens: 250_000 }),
        refundedTokensByPaymentIntent: async () => 250_000,
        balanceOf: async () => 500_000,
      },
    );
    expect(result.duplicate).toBe(true);
    expect(result.booked).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("begrenzt die Erstattung auf das vorhandene Guthaben", async () => {
    useDb([[{ id: 9 }]]);
    const result = await refundCreditsForCharge(
      { chargeId: "ch_1", paymentIntent: "pi_1", paidCents: 2_000, refundedCents: 2_000 },
      {
        grantedTokensByPaymentIntent: async () => ({ openId: "u-1", tokens: 250_000 }),
        refundedTokensByPaymentIntent: async () => 0,
        balanceOf: async () => 40_000,
      },
    );
    expect(result.cappedByBalance).toBe(true);
    expect(result.tokens).toBe(40_000);
  });
});

describe("Test-Hook", () => {
  it("verweigert den Hook ausserhalb des Testmodus", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalVitest = process.env.VITEST;
    try {
      process.env.NODE_ENV = "production";
      Reflect.deleteProperty(process.env, "VITEST");
      expect(() => setCreditLedgerDbForTests(null)).toThrow(/nur im Test-Modus/);
    } finally {
      if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
      else process.env.NODE_ENV = originalNodeEnv;
      if (originalVitest === undefined) Reflect.deleteProperty(process.env, "VITEST");
      else process.env.VITEST = originalVitest;
    }
  });

  it("laesst sich zuruecksetzen und danach erneut binden", async () => {
    useDb([[{ balance: 100 }]]);
    await expect(readCreditBalance("u")).resolves.toBe(100);
    setCreditLedgerDbForTests(null);
    useDb([[{ balance: 250 }]]);
    await expect(readCreditBalance("u")).resolves.toBe(250);
  });
});
