import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const output = resolve(
  process.env.RELEASE_HANDOFF_OUTPUT ?? "release-handoff.json",
);
const allowedStatus = new Set(["passed", "failed", "cancelled", "started"]);
const status = allowedStatus.has(process.env.CI_STATUS ?? "")
  ? process.env.CI_STATUS
  : "unknown";
const handoff = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repository: process.env.GITHUB_REPOSITORY ?? "local",
  ref: process.env.GITHUB_REF_NAME ?? "local",
  commit: process.env.GITHUB_SHA ?? "local",
  runId: process.env.GITHUB_RUN_ID ?? "local",
  runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "1",
  status,
  checks: {
    install: "pnpm install --frozen-lockfile",
    typecheck: "pnpm check",
    tests: "pnpm test",
    build: "pnpm build",
  },
  secretsIncluded: false,
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(handoff, null, 2)}\n`, "utf8");
console.log(`Release handoff written to ${output}`);
