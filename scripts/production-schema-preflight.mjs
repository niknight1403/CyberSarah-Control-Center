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

const required=[
  "revenue_jobs","revenue_offers","revenue_experiments","revenue_attribution_events","revenue_cost_events",
  "b2b_network_nodes","b2b_network_edges","influencer_learning_states",
];

const pool=new Pool({...deployPgPoolConfig(url),max:1,connectionTimeoutMillis:10_000});
try{
  const growthRepair=await readFile(new URL("../drizzle/0019_repair_growth_schema.sql",import.meta.url),"utf8");
  const draftQueueRepair=await readFile(new URL("../drizzle/0020_draft_queue_dedupe.sql",import.meta.url),"utf8");
  // Repairs are intentionally idempotent. This also protects an existing production
  // database whose historical Drizzle journal is owned by another role.
  await pool.query(growthRepair.replaceAll("--> statement-breakpoint",""));

  const draftQueueState=await pool.query(
    "select to_regclass('public.\"draftQueue\"') is not null as present",
  );
  const draftQueueExists=Boolean(draftQueueState.rows[0]?.present);
  if(draftQueueExists){
    await pool.query(draftQueueRepair.replaceAll("--> statement-breakpoint",""));
  }

  const result=await pool.query(
    "select relname from pg_class where relkind in ('r','p') and relname = any($1::text[])",
    [required],
  );
  const present=new Set(result.rows.map(row=>String(row.relname)));
  const missing=required.filter(name=>!present.has(name));
  const draftQueueReady=!draftQueueExists || Boolean((await pool.query(
    "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='draftQueue' and column_name='dedupeKey') as present",
  )).rows[0]?.present);

  if(missing.length||!draftQueueReady){
    const absent=[...missing,...(!draftQueueReady?["draftQueue.dedupeKey"]:[])];
    console.error("[schema-preflight] Kritische Schema-Teile fehlen nach Repair: "+absent.join(", "));
    process.exitCode=1;
  }else{
    console.log("[schema-preflight] OK: "+required.length+" kritische Revenue/Growth-Tabellen vorhanden; Draft-Queue-Repair "+(draftQueueExists?"verifiziert":"auf frischer DB aufgeschoben")+".");
  }
}finally{
  await pool.end();
}
