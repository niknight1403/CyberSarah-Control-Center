import { describe, expect, it } from "vitest";
import {
  boundedPageCount,boundedSyncDays,commissionCents,commissionProductSlug,
  hashedBuyerEmail,ledgerOrderKey,minimalCommissionPayload,minimalIpnPayload,
  normalizeApiFailure,parseCommissionDate,safeProductUrl,shouldPollCommissions,
  transactionIdentity,validSha512Hex,
} from "../lib/digistore24-ledger-logic";

describe("Digistore24 deterministic ledger and production gates (10 sprints)",()=>{
  it("Sprint 1: normalizes positive sales and reversals even if API amount is negative",()=>{
    expect(commissionCents("12.34","sale")).toBe(1234);
    expect(commissionCents("-12.34","refund")).toBe(-1234);
    expect(commissionCents("12.34","chargeback")).toBe(-1234);
    expect(()=>commissionCents("NaN","sale")).toThrow("D24_INVALID_AMOUNT");
    expect(()=>commissionCents("9999999999","sale")).toThrow("D24_AMOUNT_OUT_OF_RANGE");
  });
  it("Sprint 2: rejects missing or unknown IDs instead of collapsing commissions",()=>{
    expect(transactionIdentity({id:123})).toBe("123");
    expect(transactionIdentity({transaction_id:"tx-12"})).toBe("tx-12");
    expect(()=>transactionIdentity({})).toThrow("D24_MISSING_TRANSACTION_ID");
    expect(()=>transactionIdentity({id:"unknown"})).toThrow("D24_MISSING_TRANSACTION_ID");
  });
  it("Sprint 3: maintains legacy idempotency keys after a deployment",()=>{
    expect(ledgerOrderKey("api","123","sale")).toBe("d24:123:sale");
    expect(ledgerOrderKey("api","123","refund")).toBe("d24:123:refund");
    expect(ledgerOrderKey("ipn","123:payment","sale")).toBe("123:payment");
    const long=ledgerOrderKey("api","x".repeat(300),"sale");
    expect(long.length).toBeLessThanOrEqual(200);
    expect(long).not.toBe(ledgerOrderKey("api","y".repeat(300),"sale"));
  });
  it("Sprint 4: bounds API sync days and pages for free-tier resilience",()=>{
    expect(boundedSyncDays(1000)).toBe(90);
    expect(boundedSyncDays(-20)).toBe(1);
    expect(boundedSyncDays("nonsense")).toBe(30);
    expect(boundedPageCount(Infinity)).toBe(1);
    expect(boundedPageCount(300)).toBe(20);
  });
  it("Sprint 5: handles upstream date formats without invalid Date writes",()=>{
    const fallback=new Date("2026-01-01T00:00:00Z");
    expect(parseCommissionDate("2026-10-28 12:00:00",fallback).toISOString()).toBe("2026-10-28T12:00:00.000Z");
    expect(parseCommissionDate("bad",fallback)).toEqual(fallback);
  });
  it("Sprint 6: minimizes stored API and IPN payloads",()=>{
    const record={
      id:2,amount:"3.00",currency:"EUR",buyer_email:"alice@example.test",
      buyer_name:"Alice",address:"Street 1",phone:"123",secret_token:"secret",
    };
    const safe=minimalCommissionPayload(record);
    expect(safe).toEqual({id:2,amount:"3.00",currency:"EUR"});
    const ipn=minimalIpnPayload({
      order_id:"3",commission:"3.00",buyer_email:"alice@example.test",
      bank_account:"DE000",sha_sign:"signature",
    });
    expect(ipn).toEqual({order_id:"3",commission:"3.00"});
  });
  it("Sprint 7: uses a keyed customer hash, not a dictionary-guessable SHA",()=>{
    const a=hashedBuyerEmail(" USER@example.test ","secret-A");
    const b=hashedBuyerEmail("user@example.test","secret-B");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(hashedBuyerEmail("user@example.test",undefined)).toBeNull();
  });
  it("Sprint 8: prevents wrong product links and double-counted polling with active IPN",()=>{
    expect(commissionProductSlug({product_id:123})).toBe("123");
    expect(safeProductUrl({product_id:123})).toContain("/product/123/");
    expect(safeProductUrl({purchase_id:"private-order"})).toContain("/marketplace/");
    expect(shouldPollCommissions({apiKey:"valid"})).toBe(true);
    expect(shouldPollCommissions({apiKey:"valid",ipnSecret:"configured"})).toBe(false);
  });
  it("Sprint 9: validates exact-length hex signature before timing-safe compare",()=>{
    expect(validSha512Hex("a".repeat(128))).toBe(true);
    expect(validSha512Hex("g".repeat(128))).toBe(false);
    expect(validSha512Hex("a".repeat(129))).toBe(false);
  });
  it("Sprint 10: distinguishes bad keys from temporary provider outages",()=>{
    expect(normalizeApiFailure({result:"error",code:2},200)).toBe("AUTH_INVALID");
    expect(normalizeApiFailure(null,429)).toBe("RATE_LIMIT");
    expect(normalizeApiFailure(null,502)).toBe("UNAVAILABLE");
    expect(normalizeApiFailure({result:"error",code:42},200)).toBe("REJECTED");
  });
});
