#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import pg from "pg";
import { deployPgPoolConfig, validateDatabaseUrl } from "../lib/render-deploy-logic.mjs";

const { Pool } = pg;
const dbCheck=validateDatabaseUrl(process.env.DATABASE_URL??"");
if(!dbCheck.ok){
  console.error(`[schema-preflight] DATABASE_URL ungueltig: ${dbCheck.reason}`);
  process.exit(2);
}
const url=dbCheck.url;

const required=[
  "revenue_jobs","revenue_offers","revenue_experiments","revenue_attribution_events","revenue_cost_events",
  "b2b_network_nodes","b2b_network_edges","influencer_learning_states",
];

const pool=new Pool({...deployPgPoolConfig(url),max:1,connectionTimeoutMillis:10_000});
try{
  const sql=await readFile(new URL("../drizzle/0019_repair_growth_schema.sql",import.meta.url),"utf8");
  // The repair migration is intentionally idempotent. Running it as a preflight
  // makes production resilient to a stale/mis-recorded Drizzle migration journal.
  await pool.query(sql.replaceAll("--> statement-breakpoint",""));
  const result=await pool.query(
    "select relname from pg_class where relkind in ('r','p') and relname = any($1::text[])",
    [required],
  );
  const present=new Set(result.rows.map(row=>String(row.relname)));
  const missing=required.filter(name=>!present.has(name));
  if(missing.length){
    console.error(`[schema-preflight] Kritische Tabellen fehlen nach Repair: ${missing.join(", ")}`);
    process.exitCode=1;
  }else{
    console.log(`[schema-preflight] OK: ${required.length} kritische Revenue/Growth-Tabellen vorhanden.`);
  }
}finally{
  await pool.end();
}
