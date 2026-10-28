#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import pg from "pg";
import { deployPgPoolConfig } from "../lib/render-deploy-logic.mjs";

const { Pool } = pg;
const url=(process.env.DATABASE_URL??"").trim();
if(!/^postgres(?:ql)?:\/\//i.test(url)){
  console.error("[schema-preflight] DATABASE_URL fehlt oder ist kein PostgreSQL-URL.");
  process.exit(2);
}

const required=["revenue_jobs","revenue_offers","revenue_experiments","revenue_attribution_events","revenue_cost_events","b2b_network_nodes","b2b_network_edges","influencer_learning_states"];
const pool=new Pool({...deployPgPoolConfig(url),max:1,connectionTimeoutMillis:10_000});
try{
  const sql=await readFile(new URL("../drizzle/0019_repair_growth_schema.sql",import.meta.url),"utf8");
  await pool.query(sql.replaceAll("--> statement-breakpoint",""));
  await pool.query('ALTER TABLE "draftQueue" ADD COLUMN IF NOT EXISTS "dedupeKey" varchar(220)');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS "draftQueue_dedupe_idx" ON "draftQueue" ("dedupeKey")');
  const result=await pool.query("select relname from pg_class where relkind in ('r','p') and relname = any($1::text[])",[required]);
  const present=new Set(result.rows.map(row=>String(row.relname)));
  const missing=required.filter(name=>!present.has(name));
  const column=await pool.query("select 1 from information_schema.columns where table_schema=current_schema() and table_name=$1 and column_name=$2 limit 1",["draftQueue","dedupeKey"]);
  const index=await pool.query("select 1 from pg_indexes where schemaname=current_schema() and indexname=$1 limit 1",["draftQueue_dedupe_idx"]);
  if(!column.rowCount) missing.push("draftQueue.dedupeKey");
  if(!index.rowCount) missing.push("draftQueue_dedupe_idx");
  if(missing.length){
    console.error("[schema-preflight] Kritisches Schema fehlt nach Repair: "+missing.join(", "));
    process.exitCode=1;
  }else{
    console.log("[schema-preflight] OK: "+required.length+" kritische Revenue/Growth-Tabellen + Draft-Dedupe-Schema vorhanden.");
  }
}finally{
  await pool.end();
}
