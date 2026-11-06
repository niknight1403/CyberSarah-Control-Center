/**
 * Schema-Gesundheit als reine Logik.
 *
 * Hintergrund: Die Lead-Pipeline schreibt in `b2b_network_nodes`,
 * `revenue_jobs` und `conversion_events`. Fehlt eine dieser Tabellen, scheitert
 * nicht die Startseite, sondern still der Funnel — Anfragen und Zahlungen
 * verschwinden. Deshalb wird der Tabellenstand wie eine Health-Check behandelt
 * und nicht wie ein Migrationsdetail.
 *
 * Diese Datei entscheidet nur, DIE Abfrage steht in server/schema-health.ts.
 */

export type CoreTable = {
  name: string;
  /** Was ohne diese Tabelle nicht mehr funktioniert. */
  impact: string;
  /** Migrationsdatei, die sie anlegt — fuer die Fehlersuche. */
  migration: string;
};

export const CORE_TABLES: readonly CoreTable[] = [
  {
    name: "users",
    impact: "Login, Konten, Session-Zuordnung",
    migration: "0000_dapper_husk.sql",
  },
  {
    name: "b2b_network_nodes",
    impact: "Leads, Kundenkonten und Netzwerk-Knoten (Erstgespraech-Anfrage schreibt hier)",
    migration: "0018_b2b_influencer_learning.sql",
  },
  {
    name: "revenue_jobs",
    impact: "Auftrags- und Ereignisprotokoll (Anfragen, Checkout-Referenzen)",
    migration: "0016_revenue_autopilot_v2.sql",
  },
  {
    name: "conversion_events",
    impact: "Umsatz- und Conversion-Protokoll (KPI-Auswertung)",
    migration: "0013_affiliate_revenue.sql",
  },
] as const;

export const CORE_TABLE_NAMES: readonly string[] = CORE_TABLES.map((table) => table.name);

export type SchemaHealth = {
  ok: boolean;
  checked: number;
  missing: { name: string; impact: string; migration: string }[];
  /** Kurzfassung fuer Log und Health-Endpunkt. */
  summary: string;
};

/** Vergleicht vorhandene mit erwarteten Tabellen. */
export function evaluateSchemaHealth(present: readonly string[]): SchemaHealth {
  const have = new Set(present.map((name) => name.toLowerCase()));
  const missing = CORE_TABLES.filter((table) => !have.has(table.name.toLowerCase())).map((table) => ({
    name: table.name,
    impact: table.impact,
    migration: table.migration,
  }));

  const summary =
    missing.length === 0
      ? `Schema vollstaendig (${CORE_TABLES.length} Kerntabellen vorhanden).`
      : `Schema unvollstaendig: ${missing.map((entry) => entry.name).join(", ")} fehlen. Migrationen ausfuehren: ${[
          ...new Set(missing.map((entry) => entry.migration)),
        ].join(", ")}.`;

  return { ok: missing.length === 0, checked: CORE_TABLES.length, missing, summary };
}

/**
 * Beim Start: fehlende Tabellen sind ein Betriebsfehler, kein Startproblem —
 * es sei denn, es wird ausdruecklich streng geprueft. Der Unterschied ist
 * Absicht: eine 503 auf der Startseite hilft niemandem, ein lauter Alarm im Log
 * und eine rote Readiness schon.
 */
export function startupVerdict(health: SchemaHealth, strict: boolean): { level: "ok" | "warn" | "fatal"; message: string } {
  if (health.ok) return { level: "ok", message: health.summary };
  if (strict) {
    return {
      level: "fatal",
      message: `${health.summary} STRICT_SCHEMA_CHECK ist gesetzt: Start wird abgebrochen, damit keine Ereignisse verloren gehen.`,
    };
  }
  return {
    level: "warn",
    message: `${health.summary} Der Betrieb laeuft weiter, Readiness meldet rot. Ursache ist fast immer: Migrationen wurden beim Deploy nicht ausgefuehrt.`,
  };
}

/** Readiness-Ausgabe: nur Namen und Hinweis, keine Zugangsdaten. */
export function readinessSchemaBlock(health: SchemaHealth): Record<string, unknown> {
  return {
    ok: health.ok,
    checked: health.checked,
    missing: health.missing.map((entry) => entry.name),
    hint: health.ok ? null : "npm run db:audit -- --apply (Migrationen nachziehen)",
  };
}
