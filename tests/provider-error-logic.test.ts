import { describe, expect, it } from "vitest";
import { classifyProviderError } from "../lib/provider-error-logic";

describe("provider error logic", () => {
  it("classifies timeouts as retryable", () => {
    expect(classifyProviderError({ code: "ETIMEDOUT" })).toEqual({
      kind: "timeout",
      retryable: true,
      message: "Der Provider hat nicht rechtzeitig geantwortet.",
    });
  });

  it("classifies auth failures as non-retryable", () => {
    expect(classifyProviderError({ status: 401, message: "invalid api key" }).kind).toBe("authentication");
    expect(classifyProviderError({ statusCode: 403 }).retryable).toBe(false);
  });

  it("classifies rate limits and network errors as retryable", () => {
    expect(classifyProviderError({ status: 429 }).kind).toBe("rate-limit");
    expect(classifyProviderError({ code: "ECONNREFUSED" }).kind).toBe("network");
  });

  it("classifies invalid configuration as non-retryable", () => {
    expect(classifyProviderError({ status: 400, message: "invalid endpoint" })).toEqual({
      kind: "configuration",
      retryable: false,
      message: "Die Provider-Konfiguration ist ungültig.",
    });
  });

  it("never returns secrets or endpoints in the user-facing result", () => {
    const result = classifyProviderError({ message: "Bearer super-secret https://10.0.0.4:11434/v1" });
    expect(JSON.stringify(result)).not.toContain("super-secret");
    expect(JSON.stringify(result)).not.toContain("10.0.0.4");
  });
});
