import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const workflow = readFileSync(".github/workflows/control-center-autopilot.yml", "utf8");
describe("Sprint 07: secure scheduled growth worker", () => {
  it("requires token-authenticated HTTPS and hides raw revenue data from logs", () => {
    expect(workflow).toContain('Authorization: Bearer $TOKEN');
    expect(workflow).toContain('case "$BASE_URL" in https://*');
    expect(workflow).not.toContain('cat "$body_file"');
    expect(workflow).toContain('jq -e');
  });
  it("does not automatically retry stateful POST and duplicate growth actions", () => {
    expect(workflow).toContain("--request POST");
    expect(workflow).not.toContain("--retry 2");
    expect(workflow).toContain("concurrency:");
  });
});
