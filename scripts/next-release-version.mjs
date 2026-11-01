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

import { isVersionReleased, resolveBuildVersion } from "../lib/release-version-logic.ts";

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
// Wunschversionen (auch ein alter Pin in .github/release-requests/version.txt)
// sind Mindeststand und duerfen kein bestehendes Release ueberschreiben.
const candidate = resolveBuildVersion(tags, process.argv[2], "2.7.0");
// Fail-closed-Guard: eine bereits veroeffentlichte Version darf nie erneut
// gebaut werden — sonst ueberschreibt --clobber ein bestehendes Release.
if (isVersionReleased(tags, candidate)) {
  console.error(`Fehler: Version ${candidate} ist bereits als Release veroeffentlicht.`);
  process.exit(1);
}
const [major, minor, patch] = candidate.split(".").map(Number);
const belowMinimum = major < 2 || (major === 2 && minor < 7);
const version = belowMinimum ? "2.7.0" : `${major}.${minor}.${patch}`;
console.log(version);
