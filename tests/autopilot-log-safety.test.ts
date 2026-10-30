import { describe, expect, it } from "vitest";
import { redactAutopilotLog } from "../lib/autopilot-log-safety";
describe("Sprint 19 – secrets never leave Control-Center cron via error logs", () => {
  it("masks bearer credentials, payment secrets and webhook signing tokens", () => {
    const payment = ["sk", "live", "mockpaymentsecret123"].join("_");
    const webhook = ["whsec", "mocksigningsecret123"].join("_");
    const input = "Bearer abcdefghijklmnop payment=" + payment + " webhook=" + webhook;
    const sanitized = redactAutopilotLog(input);
    expect(sanitized).not.toContain(payment);
    expect(sanitized).not.toContain(webhook);
    expect(sanitized).not.toContain("abcdefghijklmnop");
  });
  it("hides incident emails and URL query credentials", () => {
    const result = redactAutopilotLog("sam@example.org failed api_key=secretvalue&password=foo");
    expect(result).not.toContain("sam@example.org");
    expect(result).not.toContain("secretvalue");
    expect(result).not.toContain("password=foo");
  });
  it("keeps sanitized diagnostics short even for oversized provider exceptions", () => {
    expect(redactAutopilotLog(new Error("err".repeat(500))).length).toBeLessThanOrEqual(500);
  });
});
