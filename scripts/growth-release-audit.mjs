/**
 * Growth release gate: inspect the actual compiled-source inputs before merge.
 * No external API calls, no credentials and no paid actions.
 */
import { readFileSync } from "node:fs";
const file = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const checks = [
  ["admin-only growth API", file("server/control-center-autopilot-router.ts").includes("growthOverview: adminProcedure")],
  ["admin-only manual trigger", file("server/control-center-autopilot-router.ts").includes("growthRunNow: adminProcedure")],
  ["operator pause", file("server/always-on-growth.ts").includes("isGrowthPulseRunning()")],
  ["process reentrancy gate", file("server/always-on-growth.ts").includes("executionGuard.acquire()")],
  ["pending external publication", file("lib/always-on-growth-logic.ts").includes("publishingAuthorized: false")],
  ["no automated advertising spend", file("lib/always-on-growth-logic.ts").includes("spendingAuthorized: false")],
  ["no unapproved live price change", file("lib/always-on-growth-logic.ts").includes("priceChangesAuthorized: false")],
  ["evidence quality filter", file("server/always-on-growth.ts").includes("auditGrowthMetrics(")],
  ["refund safety gate", file("server/always-on-growth.ts").includes("refund-risk-review")],
  ["cron never logs raw response", !file(".github/workflows/control-center-autopilot.yml").includes('cat "$body_file"')],
  ["cron has bearer authentication", file(".github/workflows/control-center-autopilot.yml").includes('Authorization: Bearer $TOKEN')],
];
const failures = checks.filter(([, ok]) => !ok).map(([label]) => label);
console.log("CyberSarah Growth release audit: " + (checks.length - failures.length) + "/" + checks.length + " static safety gates.");
if (failures.length) {
  console.error("Gates failed:\n" + failures.join("\n"));
  process.exitCode = 1;
}
