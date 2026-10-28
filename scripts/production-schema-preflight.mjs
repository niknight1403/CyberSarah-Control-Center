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
  // 0020 is idempotent too; preflight repairs its runtime objects even when
  // the legacy Drizzle journal itself is not writable by the deploy role.
  await pool.query('ALTER TABLE "draftQueue" ADD COLUMN IF NOT EXISTS "dedupeKey" varchar(220)');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS "draftQueue_dedupe_idx" ON "draftQueue" ("dedupeKey")');

  const result=await pool.query("select relname from pg_class where relkind in ('r','p') and relname = any($1::text[])",[required]);
  const present=new Set(result.rows.map(row=>String(row.relname)));
  const missing=required.filter(name=>!present.has(name));

  const column=await pool.query("select 1 from information_schema.columns where table_schema=current_schema() and table_name=$1 and column_name=$2 limit 1",["draftQueue","dedupeKey"]);
  if(!column.rowCount) missing.push("draftQueue.dedupeKey");

  const index=await pool.query(
    "select i.indisunique,i.indisvalid,t.relname as table_name,array_agg(a.attname order by ord.ordinality) as columns "+
    "from pg_class idx join pg_index i on i.indexrelid=idx.oid join pg_class t on t.oid=i.indrelid "+
    "join pg_namespace n on n.oid=t.relnamespace join unnest(i.indkey) with ordinality ord(attnum,ordinality) on true "+
    "join pg_attribute a on a.attrelid=t.oid and a.attnum=ord.attnum "+
    "where n.nspname=current_schema() and idx.relname=$1 group by i.indisunique,i.indisvalid,t.relname",
    ["draftQueue_dedupe_idx"],
  );
  const idx=index.rows[0];
  const validIndex=Boolean(idx&&idx.indisunique===true&&idx.indisvalid===true&&idx.table_name==="draftQueue"&&Array.isArray(idx.columns)&&idx.columns.length===1&&idx.columns[0]==="dedupeKey");
  if(!validIndex) missing.push("draftQueue_dedupe_idx(unique draftQueue.dedupeKey)");

  if(missing.length){
    console.error("[schema-preflight] Kritisches Schema fehlt oder ist ungueltig nach Repair: "+missing.join(", "));
    process.exitCode=1;
  }else{
    console.log("[schema-preflight] OK: "+required.length+" kritische Revenue/Growth-Tabellen + gueltiges Draft-Dedupe-Schema vorhanden.");
  }
}finally{
  await pool.end();
}
