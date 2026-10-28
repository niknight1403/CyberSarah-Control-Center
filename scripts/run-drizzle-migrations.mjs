#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { deployPgPoolConfig, maskSecrets } from "../lib/render-deploy-logic.mjs";

const raw=(process.env.DATABASE_URL??"").trim();
if(!/^postgres(?:ql)?:\/\//i.test(raw)){
  console.error("[db-migrate] DATABASE_URL fehlt oder ist kein PostgreSQL-URL.");
  process.exit(2);
}

const { Pool }=pg;
const pool=new Pool({...deployPgPoolConfig(raw),max:1,connectionTimeoutMillis:10_000});

async function expectedRuntimeObjects(){
  const dir=new URL("../drizzle/",import.meta.url);
  const files=(await readdir(dir)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
  const tables=new Set();
  const columns=[];
  for(const name of files){
    const source=await readFile(new URL(name,dir),"utf8");
    for(const match of source.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+"([^"]+)"/gi)) tables.add(match[1]);
    for(const match of source.matchAll(/ALTER TABLE\s+"([^"]+)"\s+ADD COLUMN(?: IF NOT EXISTS)?\s+"([^"]+)"/gi)) columns.push([match[1],match[2]]);
  }
  return {tables:[...tables],columns};
}

async function verifiedJournalPermissionFallback(){
  const journal=JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json",import.meta.url),"utf8"));
  const latest=journal.entries?.at(-1)?.tag??"";
  // Fail closed when a future migration is added.
  if(latest!=="0020_draft_queue_dedupe") return false;

  const expected=await expectedRuntimeObjects();
  const tableRows=await pool.query("select relname from pg_class where relkind in ('r','p') and relname = any($1::text[])",[expected.tables]);
  const present=new Set(tableRows.rows.map(row=>String(row.relname)));
  if(expected.tables.some(name=>!present.has(name))) return false;

  for(const [table,column] of expected.columns){
    const found=await pool.query("select 1 from information_schema.columns where table_schema=current_schema() and table_name=$1 and column_name=$2 limit 1",[table,column]);
    if(!found.rowCount) return false;
  }

  const index=await pool.query(
    "select i.indisunique,i.indisvalid,t.relname as table_name,array_agg(a.attname order by ord.ordinality) as columns "+
    "from pg_class idx join pg_index i on i.indexrelid=idx.oid join pg_class t on t.oid=i.indrelid "+
    "join pg_namespace n on n.oid=t.relnamespace join unnest(i.indkey) with ordinality ord(attnum,ordinality) on true "+
    "join pg_attribute a on a.attrelid=t.oid and a.attnum=ord.attnum "+
    "where n.nspname=current_schema() and idx.relname=$1 group by i.indisunique,i.indisvalid,t.relname",
    ["draftQueue_dedupe_idx"],
  );
  const row=index.rows[0];
  return Boolean(row&&row.indisunique===true&&row.indisvalid===true&&row.table_name==="draftQueue"&&Array.isArray(row.columns)&&row.columns.length===1&&row.columns[0]==="dedupeKey");
}

try{
  const db=drizzle(pool);
  await migrate(db,{migrationsFolder:"drizzle"});
  console.log("[db-migrate] Drizzle-Migrationen erfolgreich angewendet.");
}catch(error){
  const e=error instanceof Error?error:new Error(String(error));
  const cause=e.cause&&typeof e.cause==="object"?e.cause:null;
  const details={
    name:e.name,message:e.message,code:e.code,detail:e.detail,hint:e.hint,table:e.table,column:e.column,constraint:e.constraint,
    cause:cause?{name:cause.name,message:cause.message,code:cause.code,detail:cause.detail,hint:cause.hint,schema:cause.schema,table:cause.table,column:cause.column,constraint:cause.constraint}:null,
  };
  const journalPermissionDenied=(cause?.code??e.code)==="42501"&&String(cause?.message??e.message).includes("schema drizzle");
  if(journalPermissionDenied&&await verifiedJournalPermissionFallback()){
    console.warn("[db-migrate] Legacy-Drizzle-Journal ist fuer den Deploy-User nicht beschreibbar; alle durch Migrationen erwarteten Tabellen/Spalten bis 0020 sowie der gueltige UNIQUE-Dedupe-Index wurden verifiziert.");
  }else{
    console.error("[db-migrate] Migration fehlgeschlagen:",maskSecrets(JSON.stringify(details)));
    process.exitCode=1;
  }
}finally{
  await pool.end();
}
