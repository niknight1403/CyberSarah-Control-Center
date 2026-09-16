#!/usr/bin/env node
/**
 * Ermittelt die naechste Release-Version fuer den APK-Build.
 *
 * Aufruf (im Workflow mit Node >= 22.6):
 *   node --experimental-strip-types scripts/next-release-version.mjs [wunsch]
 *
 * - Mit gueltigem semver-artigen Argument (X.Y.Z) wird dieses ausgegeben.
 * - Ohne/ungueltiges Argument: Auto-Ableitung — hoechster vorhandener
 *   v<major>.<minor>.<patch>-apk-Tag + 1 auf Patch-Ebene.
 * - Die Regeln selbst liegen getestet in lib/release-version-logic.ts.
 * - Gibt NUR die Versionsnummer auf stdout aus (fuer $(...) in Workflows).
 */
import { execFileSync } from "node:child_process";

import { nextReleaseVersion } from "../lib/release-version-logic.ts";

function ghReleaseTags() {
  try {
    const out = execFileSync(
      "gh",
      ["release", "list", "--limit", "100", "--json", "tagName"],
      { encoding: "utf-8" },
    );
    const parsed = JSON.parse(out);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => (entry && typeof entry.tagName === "string" ? entry.tagName : ""))
      .filter(Boolean);
  } catch (error) {
    console.error(`Warnung: Tag-Liste nicht ermittelbar (${error.message}) — nutze Fallback.`);
    return [];
  }
}

const tags = ghReleaseTags();
const version = nextReleaseVersion(tags, process.argv[2]);
console.log(version);
