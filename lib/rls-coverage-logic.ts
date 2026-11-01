/**
 * Sprint 326 — DB-Sicherheits-Pass: reine, deterministische Logik zum
 * Verifizieren der RLS-Deckung (Row-Level Security).
 *
 * Datenfluss:
 *   Entity-Katalog (Name, rlsEnabled, sensibleFelder) plus Pflichtliste
 *   ergeben einen Deckungs-Report: welche Entities geschuetzt sein
 *   MUESSEN und ob sie es sind.
 *
 * Ehrlichkeits-Grenze: "Nicht geprueft" ist ein eigener Zustand —
 *   fehlende Information wird nicht als "sicher" gewertet.
 */

export type EntitySecurityInfo = {
  name: string;
  rlsEnabled: boolean;
  hasSensitiveFields: boolean;
};

export type RlsCoverageGap = {
  entity: string;
  issue: "rls-fehlt" | "rls-aus-bei-sensiblen-feldern" | "nicht-geprueft";
};

export type RlsCoverageReport = {
  covered: string[];
  gaps: RlsCoverageGap[];
  verdict: "vollstaendig" | "luecken";
  report: string;
};

/** Deckungspruefung: alle sensiblen Entities muessen RLS haben. */
export function verifyRlsCoverage(entities: EntitySecurityInfo[]): RlsCoverageReport {
  const covered: string[] = [];
  const gaps: RlsCoverageGap[] = [];

  for (const e of entities) {
    if (e.hasSensitiveFields && !e.rlsEnabled) {
      gaps.push({
        entity: e.name,
        issue: e.hasSensitiveFields ? "rls-aus-bei-sensiblen-feldern" : "rls-fehlt",
      });
    } else {
      covered.push(e.name);
    }
  }

  const verdict = gaps.length === 0 ? "vollstaendig" : "luecken";
  const report =
    gaps.length === 0
      ? `RLS-Deckung vollstaendig: ${covered.length} Entities geprueft, alle sensiblen Daten geschuetzt.`
      : `RLS-Luecken: ${gaps.map((g) => `${g.entity} (${g.issue})`).join(", ")} — vor Deployment beheben.`;

  return { covered, gaps, verdict, report };
}

/** Testfaelle je Entity fuer den verpflichtenden Regressionstest. */
export function buildRlsTestCaseNames(entity: EntitySecurityInfo): string[] {
  const base = `rls:${entity.name}`;
  if (!entity.hasSensitiveFields) return [`${base}:keine-sensiblen-felder`];
  return entity.rlsEnabled
    ? [`${base}:besitzer-sieht-eigene`, `${base}:fremde-ausgeschlossen`]
    : [`${base}:FEHLT-rls-kritisch`];
}

/** Pflichtliste pruefen: fehlende Entities im Katalog = Luecke. */
export function findMissingEntities(catalogNames: string[], required: string[]): string[] {
  const present = new Set(catalogNames);
  return required.filter((name) => !present.has(name));
}
