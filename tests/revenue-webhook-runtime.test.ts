import {beforeEach,describe,expect,it} from "vitest";
import {
  getRevenueWebhookRuntimeStatus,
  markRevenueWebhookFailure,
  markRevenueWebhookSuccess,
  resetRevenueWebhookRuntimeForTests,
} from "../server/revenue-webhook-runtime";

describe("revenue webhook runtime telemetry",()=>{
  beforeEach(()=>resetRevenueWebhookRuntimeForTests());

  it("tracks failure streaks and clears them after success without storing payloads",()=>{
    markRevenueWebhookFailure("stripe","signature_missing");
    markRevenueWebhookFailure("stripe","processing","invoice.payment_failed");
    let state=getRevenueWebhookRuntimeStatus().stripe;
    expect(state.received).toBe(2);
    expect(state.consecutiveFailures).toBe(2);
    expect(state.lastFailureKind).toBe("processing");
    expect(state.lastEventType).toBe("invoice.payment_failed");

    markRevenueWebhookSuccess("stripe","invoice.paid");
    state=getRevenueWebhookRuntimeStatus().stripe;
    expect(state.succeeded).toBe(1);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.lastEventType).toBe("invoice.paid");
    expect(state.lastFailureKind).toBeNull();
  });
});
