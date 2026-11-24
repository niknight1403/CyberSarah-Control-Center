#!/usr/bin/env node
/**
 * Produktions-Schema-Preflight vor den Drizzle-Migrationen.
 *
 * Repariert bekannte Schema-Drift (0019 Growth/Revenue, 0020 Draft-Queue-
 * Dedupe) und verifiziert danach die kritischen Tabellen. Die Reparatur
 * wird vorab geplant (lib/schema-preflight-logic.mjs), damit nur wirklich
 * fehlende Objekte angefasst werden: `CREATE INDEX IF NOT EXISTS` und
 * `ALTER TABLE … ADD COLUMN IF NOT EXISTS` verlangen in PostgreSQL
 * Eigentuemer-Rechte an der Tabelle — auf einer historisch gewachsenen
 * Produktions-DB fuehrte das zu `42501 must be owner of table …` und
 * blockierte den gesamten Deploy.
 */
import { readFile } from "node:fs/promises";
import pg from "pg";
import { deployPgPoolConfig } from "../lib/render-deploy-logic.mjs";
import {
  evaluatePreflight,
  isOwnershipError,
  planSchemaRepair,
  splitRepairStatements,
} from "../lib/schema-preflight-logic.mjs";

const { Pool } = pg;
const url = (process.env.DATABASE_URL ?? "").trim();
if (!/^postgres(?:ql)?:\/\//i.test(url)) {
  console.error("[schema-preflight] DATABASE_URL fehlt oder ist kein PostgreSQL-URL.");
  process.exit(2);
}

const required = [
  "revenue_jobs",
  "revenue_offers",
  "revenue_experiments",
  "revenue_attribution_events",
  "revenue_cost_events",
  "b2b_network_nodes",
  "b2b_network_edges",
  "influencer_learning_states",
];

/** Relationen (Tabellen/Indizes) im public-Schema. */
async function loadRelations(pool, relkinds) {
  const result = await pool.query(
    "select relname from pg_class where relkind = any($1::char[]) and relnamespace = 'public'::regnamespace",
    [relkinds],
  );
  return new Set(result.rows.map((row) => String(row.relname)));
}

/** Spaltennamen einer Tabelle (leer, wenn die Tabelle fehlt). */
async function loadColumns(pool, table) {
  const result = await pool.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1",
    [table],
  );
  return new Set(result.rows.map((row) => String(row.column_name)));
}

/**
 * Fuehrt die geplanten Anweisungen einzeln aus. Fehlende Eigentuemer-Rechte
 * werden als "blockiert" gesammelt statt den Deploy abzubrechen — die
 * Verifikation entscheidet danach, ob wirklich etwas Notwendiges fehlt.
 */
async function applyStatements(pool, statements, applied, blocked) {
  for (const statement of statements) {
    try {
      await pool.query(statement);
      applied.push(statement);
    } catch (error) {
      if (isOwnershipError(error)) {
        blocked.push({ statement, message: error instanceof Error ? error.message : String(error) });
        continue;
      }
      throw error;
    }
  }
}

const pool = new Pool({ ...deployPgPoolConfig(url), max: 1, connectionTimeoutMillis: 10_000 });
try {
  const role = await pool.query("select current_user as role");
  const currentRole = String(role.rows[0]?.role ?? "unbekannt");

  const growthRepair = await readFile(new URL("../drizzle/0019_repair_growth_schema.sql", import.meta.url), "utf8");
  const draftQueueRepair = await readFile(new URL("../drizzle/0020_draft_queue_dedupe.sql", import.meta.url), "utf8");

  const existingTables = await loadRelations(pool, ["r", "p"]);
  const existingIndexes = await loadRelations(pool, ["i"]);
  const draftQueueColumns = await loadColumns(pool, "draftQueue");

  const applied = [];
  const blocked = [];
  const skipped = [];

  // 1) Growth/Revenue-Reparatur (Tabellen + Indizes)
  const growthPlan = planSchemaRepair({
    statements: splitRepairStatements(growthRepair),
    existingTables,
    existingIndexes,
  });
  skipped.push(...growthPlan.skipped);
  await applyStatements(pool, growthPlan.run, applied, blocked);

  // 2) Draft-Queue-Dedupe nur, wenn die Tabelle existiert (frische DB: spaeter)
  const tablesAfterRepair = await loadRelations(pool, ["r", "p"]);
  const draftQueueExists = tablesAfterRepair.has("draftQueue");
  const refreshedIndexes = await loadRelations(pool, ["i"]);
  if (draftQueueExists) {
    const draftPlan = planSchemaRepair({
      statements: splitRepairStatements(draftQueueRepair),
      existingTables: new Set([...existingTables, "draftQueue"]),
      existingIndexes: refreshedIndexes,
      existingColumns: { draftQueue: draftQueueColumns },
    });
    skipped.push(...draftPlan.skipped);
    await applyStatements(pool, draftPlan.run, applied, blocked);
  } else {
    skipped.push({
      statement: "(0020_draft_queue_dedupe.sql)",
      kind: "column",
      object: "draftQueue.dedupeKey",
      reason: "Tabelle draftQueue fehlt (auf frischer DB aufgeschoben)",
    });
  }

  // 3) Verifikation des Ist-Zustands
  const presentTables = await loadRelations(pool, ["r", "p"]);
  const dedupeKeyPresent = draftQueueExists
    ? (await loadColumns(pool, "draftQueue")).has("dedupeKey")
    : false;
  const verdict = evaluatePreflight({
    requiredTables: required,
    presentTables,
    draftQueueExists,
    dedupeKeyPresent,
  });

  const summary = `Rolle ${currentRole}: ${applied.length} Anweisung(en) ausgefuehrt, ${skipped.length} uebersprungen, ${blocked.length} durch fehlende Eigentuemer-Rechte blockiert.`;
  if (blocked.length > 0) {
    console.warn(`[schema-preflight] WARNUNG — ${summary}`);
    for (const entry of blocked) {
      console.warn(`[schema-preflight]   blockiert: ${entry.message}`);
    }
    console.warn(
      "[schema-preflight] Fehlende Rechte betreffen nur optionale Reparaturen; die Tabellen existieren. " +
        "Eigentuemer-Rolle fuer die Reparatur: Neon-Konsole → Rolle des Erstellers verwenden.",
    );
  } else {
    console.log(`[schema-preflight] ${summary}`);
  }

  if (!verdict.ok) {
    console.error(`[schema-preflight] ${verdict.reasons.join("; ")}`);
    process.exitCode = 1;
  } else {
    console.log(
      `[schema-preflight] OK: ${required.length} kritische Revenue/Growth-Tabellen vorhanden; Draft-Queue-Repair ` +
        (draftQueueExists ? "verifiziert" : "auf frischer DB aufgeschoben") +
        ".",
    );
  }
} finally {
  await pool.end();
}
