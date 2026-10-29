import { describe, expect, it } from "vitest";
import { isRevenuePoolConnectionFailure } from "../server/revenue-command-service";

describe("Revenue DB pool resilience", () => {
  it("recognizes the live connection termination signature", () => {
    expect(isRevenuePoolConnectionFailure(new Error("Connection terminated unexpectedly"))).toBe(true);
  });

  it("recognizes transient postgres/network codes", () => {
    expect(isRevenuePoolConnectionFailure({ code: "ECONNRESET", message: "reset" })).toBe(true);
    expect(isRevenuePoolConnectionFailure({ code: "57P01", message: "admin shutdown" })).toBe(true);
  });

  it("does not recycle the pool for ordinary SQL/application errors", () => {
    expect(isRevenuePoolConnectionFailure(new Error("column does not exist"))).toBe(false);
  });
});
