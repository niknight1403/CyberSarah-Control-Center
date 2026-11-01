import { describe, expect, it } from "vitest";
import { buildDbDebugHealthResponse } from "../lib/db-debug-logic";

describe("DB debug health response", () => {
  it("returns only a minimal positive health result", () => {
    expect(buildDbDebugHealthResponse(true)).toEqual({
      status: 200,
      body: { ok: true, database: "connected" },
    });
  });

  it("returns a minimal unavailable result without exposing diagnostics", () => {
    const result = buildDbDebugHealthResponse(false);
    expect(result).toEqual({
      status: 503,
      body: { ok: false, database: "unavailable" },
    });
    expect(JSON.stringify(result)).not.toMatch(/host|password|url|error|credential/i);
  });
});
