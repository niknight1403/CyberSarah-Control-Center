#!/usr/bin/env node
/**
 * Erzeugt aus einer fehlgeschlagenen Health-Pruefung den Alert-Text fuer den
 * Uptime-Waechter (.github/workflows/uptime-waechter.yml).
 *
 * Aufruf (im Workflow):
 *   HEALTH_STATUS=503 HEALTH_BODY_FILE=/tmp/health-body.json \
 *   HEALTH_URL=https://app.cybersarah-ki.com/api/health \
 *   ALERT_TIMESTAMP="2026-11-28 04:20 UTC" \
 *   node scripts/uptime-alert-report.mjs --out /tmp/uptime-alert
 *
 * Schreibt <out>-title.txt, <out>-body.md, <out>-comment.md, <out>-discord.txt
 * und gibt `classification=<kind>` sowie `owner_action_required=<bool>` auf
 * stdout aus (GitHub-Actions-Output-Format).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  buildAlertComment,
  buildAlertIssueBody,
  buildAlertTitle,
  buildDiscordMessage,
  classifyHealthResponse,
} from "../lib/uptime-alert-logic.mjs";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outPrefix = outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : "/tmp/uptime-alert";

const bodyFile = process.env.HEALTH_BODY_FILE ?? "";
let body = "";
if (bodyFile && existsSync(bodyFile)) {
  body = readFileSync(bodyFile, "utf8");
}

const classification = classifyHealthResponse({
  status: process.env.HEALTH_STATUS,
  body,
});

const timestamp = process.env.ALERT_TIMESTAMP ?? new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
const healthUrl = process.env.HEALTH_URL ?? "https://app.cybersarah-ki.com/api/health";

writeFileSync(`${outPrefix}-title.txt`, buildAlertTitle(classification));
writeFileSync(
  `${outPrefix}-body.md`,
  buildAlertIssueBody({ healthUrl, classification, timestamp, bodyExcerpt: body }),
);
writeFileSync(`${outPrefix}-comment.md`, buildAlertComment({ classification, timestamp }));
writeFileSync(`${outPrefix}-discord.txt`, buildDiscordMessage({ classification, timestamp }));

console.log(`classification=${classification.kind}`);
console.log(`owner_action_required=${classification.ownerActionRequired}`);
console.log(`transient=${classification.transient}`);
console.log(`Einordnung: ${classification.headline}`);
