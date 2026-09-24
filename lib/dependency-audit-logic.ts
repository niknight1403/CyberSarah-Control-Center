/**
 * Sprint 330 — Dependency-Audit: reine, deterministische Logik fuer
 * das geordnete, einzeln getestete Anheben riskanter Abhaengigkeiten.
 *
 * Datenfluss:
 *   Dependency-Aenderungen (Packet, from, to) werden nach Risiko
 *   geordnet; jede Aenderung durchlaeuft ihre eigene volle Regression.
 *   Nur getestete Bumps wandern ins Release.
 *
 * Ehrlichkeits-Grenze: "ungetestet gebumpt" ist ein eigener Zustand und
 *   blockiert den Release-Vermerk. Major-Bumps ohne Changelog-Pruefung
 *   werden nie als "sicher" markiert.
 */

export type BumpRisk = "patch" | "minor" | "major" | "unsicher";

export type DependencyBump = {
  name: string;
  fromVersion: string;
  toVersion: string;
  changelogReviewed: boolean;
};

export type BumpResult = {
  name: string;
  risk: BumpRisk;
  regressionPassed: boolean | null; // null = noch nicht gelaufen
  released: boolean;
};

/** Risiko-Klassifikation aus SemVer-Distanz (reine String-Logik). */
export function classifyBumpRisk(bump: DependencyBump): BumpRisk {
  const from = bump.fromVersion.split(".");
  const to = bump.toVersion.split(".");
  if (from.length !== 3 || to.length !== 3) return "unsicher";
  if (from[0] !== to[0]) {
    return bump.changelogReviewed ? "major" : "unsicher";
  }
  if (from[1] !== to[1]) return "minor";
  return "patch";
}

/** Reihenfolge: patch zuerst, unsicher zuletzt (Risiko klein halten). */
export function orderBumps(bumps: DependencyBump[]): DependencyBump[] {
  const weight: Record<BumpRisk, number> = { patch: 0, minor: 1, major: 2, unsicher: 3 };
  return [...bumps].sort((a, b) => {
    const ra = classifyBumpRisk(a);
    const rb = classifyBumpRisk(b);
    return weight[ra] - weight[rb] || a.name.localeCompare(b.name);
  });
}

/** Regressionsergebnis verbuchen; ohne laufende Regression kein Release. */
export function recordRegressionResult(
  result: BumpResult,
  passed: boolean,
): BumpResult {
  return { ...result, regressionPassed: passed };
}

/** Release-Freigabe je Bump: nur getestete, nicht-unsichere Bumps. */
export function mayRelease(result: BumpResult): boolean {
  return result.regressionPassed === true && result.risk !== "unsicher";
}

/** Ehrliches Audit-Zusammenfassung mit Verzoegerungen beim Namen. */
export function summarizeAudit(results: BumpResult[]): string {
  const releasable = results.filter((r) => mayRelease(r));
  const blocked = results.filter((r) => !mayRelease(r));
  const lines = [`${releasable.length}/${results.length} Bumps freigegeben.`];
  for (const b of blocked) {
    const why =
      b.regressionPassed === null
        ? "Regression noch nicht gelaufen"
        : b.regressionPassed === false
          ? "Regression ROT"
          : "Risiko 'unsicher' (Major ohne Changelog-Pruefung)";
    lines.push(`- ${b.name} (${b.risk}): blockiert — ${why}.`);
  }
  return lines.join("\n");
}
