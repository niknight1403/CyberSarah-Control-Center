#!/usr/bin/env node
import { readFile } from "node:fs/promises";\nimport pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { deployPgPoolConfig, maskSecrets } from "../lib/render-deploy-logic.mjs";

const raw=(process.env.DATABASE_URL??"").trim();
if(!/^postgres(?:ql)?:\/\//i.test(raw)){
  console.error("[db-migrate] DATABASE_URL fehlt oder ist kein PostgreSQL-URL.");
  process.exit(2);
}

const { Pool }=pg;
const pool=new Pool({...deployPgPoolConfig(raw),max:1,connectionTimeoutMillis:10_000});\n\nasync function verifiedJournalPermissionFallback(){\n  const journal=JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json",import.meta.url),"utf8"));\n  const latest=journal.entries?.at(-1)?.tag??"";\n  // Fail closed when a future migration is added.\n  if(latest!=="0020_draft_queue_dedupe") return false;\n  const tables=["revenue_jobs","revenue_offers","revenue_experiments","revenue_attribution_events","revenue_cost_events","b2b_network_nodes","b2b_network_edges","influencer_learning_states"];\n  const tableRows=await pool.query("select relname from pg_class where relkind in ($r$,$p$) and relname = any($1::text[])",[tables]);\n  const present=new Set(tableRows.rows.map(row=>String(row.relname)));\n  if(tables.some(name=>!present.has(name))) return false;\n  const column=await pool.query("select 1 from information_schema.columns where table_schema=current_schema() and table_name=$1 and column_name=$2 limit 1",["draftQueue","dedupeKey"]);\n  const index=await pool.query("select 1 from pg_indexes where schemaname=current_schema() and indexname=$1 limit 1",["draftQueue_dedupe_idx"]);\n  return Boolean(column.rowCount&&index.rowCount);\n}
try{
  const db=drizzle(pool);
  await migrate(db,{migrationsFolder:"drizzle"});
  console.log("[db-migrate] Drizzle-Migrationen erfolgreich angewendet.");
}catch(error){
  const e=error instanceof Error?error:new Error(String(error));
  const cause=e.cause&&typeof e.cause==="object"?e.cause:null;
  const details={
    name:e.name,
    message:e.message,
    code:e.code,
    detail:e.detail,
    hint:e.hint,
    table:e.table,
    column:e.column,
    constraint:e.constraint,
    cause:cause?{
      name:cause.name,
      message:cause.message,
      code:cause.code,
      detail:cause.detail,
      hint:cause.hint,
      schema:cause.schema,
      table:cause.table,
      column:cause.column,
      constraint:cause.constraint,
    }:null,
  };
  console.error("[db-migrate] Migration fehlgeschlagen:",maskSecrets(JSON.stringify(details)));
  process.exitCode=1;
}finally{
  await pool.end();
}
