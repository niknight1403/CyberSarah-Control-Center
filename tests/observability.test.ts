import { describe, expect, it } from "vitest";
import { metricsText } from "../server/_core/observability";

describe("observability", () => {
  it("emits Prometheus-compatible process metrics", () => {
    const output = metricsText();
    expect(output).toContain("# TYPE cybersarah_process_uptime_seconds gauge");
    expect(output).toContain("cybersarah_http_requests_total");
    expect(output).toContain("cybersarah_process_resident_memory_bytes");
  });
});
