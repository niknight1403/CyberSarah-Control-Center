import { describe, expect, it } from "vitest";

import { shouldRetryAuditStatus } from "@/lib/integration-audit-logic";

describe("shouldRetryAuditStatus", () => {
  it.each([0, 408, 429, 500, 502, 503, 504])("retries transient status %i", (status) => {
    expect(shouldRetryAuditStatus(status)).toBe(true);
  });

  it.each([200, 204, 400, 401, 403, 404])("does not retry a final status %i", (status) => {
    expect(shouldRetryAuditStatus(status)).toBe(false);
  });
});
