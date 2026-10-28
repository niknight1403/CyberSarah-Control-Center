#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { deployPgPoolConfig, isRestrictedDrizzleJournalError, maskSecrets } from "../lib/render-deploy-logic.mjs";

const raw=(process.env.DATABASE_URL??"").trim();
if(!/^postgres(?:ql)?:\/\//i.test(raw)){
  console.error("[db-migrate] DATABASE_URL fehlt oder ist kein PostgreSQL-URL.");
  process.exit(2);
}

const { Pool }=pg;
const pool=new Pool({...deployPgPoolConfig(raw),max:1,connectionTimeoutMillis:10_000});

function errorDetails(error){
  const e=error instanceof Error?error:new Error(String(error));
  const cause=e.cause&&typeof e.cause==="object"?e.cause:null;
  return {e,cause,details:{name:e.name,message:e.message,code:e.code,detail:e.detail,hint:e.hint,table:e.table,column:e.column,constraint:e.constraint,cause:cause?{name:cause.name,message:cause.message,code:cause.code,detail:cause.detail,hint:cause.hint,schema:cause.schema,table:cause.table,column:cause.column,constraint:cause.constraint}:null}};
}

async function bootstrapPublicJournalIfVerified(){
  if(process.env.MIGRATION_PREFLIGHT_VERIFIED!=="1") throw new Error("Public-Journal-Bootstrap verweigert: MIGRATION_PREFLIGHT_VERIFIED fehlt.");
  const state=await pool.query(
    "select to_regclass('public.\"users\"') is not null as baseline, to_regclass('public.__drizzle_migrations') is not null as journal, has_schema_privilege(current_user,'public','CREATE') as can_create",
  );
  const row=state.rows[0]??{};
  if(!row.can_create) throw new Error("Deploy-User hat auch im public-Schema kein CREATE-Recht.");
  if(!row.baseline) return {baseline:false,bootstrapped:false};

  await pool.query('CREATE TABLE IF NOT EXISTS public.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
  const count=Number((await pool.query("select count(*)::int as count from public.__drizzle_migrations")).rows[0]?.count??0);
  if(count>0) return {baseline:true,bootstrapped:false};

  const journal=JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json",import.meta.url),"utf8"));
  const latest=journal.entries?.at(-1);
  if(!latest?.tag||!latest?.when) throw new Error("Drizzle-Journal enthält keinen letzten Migrationseintrag.");
  const sql=await readFile(new URL("../drizzle/"+latest.tag+".sql",import.meta.url),"utf8");
  const hash=createHash("sha256").update(sql).digest("hex");
  await pool.query("insert into public.__drizzle_migrations(hash,created_at) values($1,$2)",[hash,Number(latest.when)]);
  console.log("[db-migrate] Bestehende, vorab verifizierte Produktion auf public-Migrationsjournal gebootstrapped: "+latest.tag+".");
  return {baseline:true,bootstrapped:true};
}

try{
  const db=drizzle(pool);
  try{
    await migrate(db,{migrationsFolder:"drizzle"});
    console.log("[db-migrate] Drizzle-Migrationen erfolgreich angewendet.");
  }catch(error){
    const permissionDenied=isRestrictedDrizzleJournalError(error);
    if(!permissionDenied) throw error;
    console.warn("[db-migrate] Historisches drizzle-Journal ist fuer den Deploy-User nicht beschreibbar; wechsle kontrolliert auf public.");
    await bootstrapPublicJournalIfVerified();
    await migrate(db,{migrationsFolder:"drizzle",migrationsSchema:"public"});
    console.log("[db-migrate] Drizzle-Migrationen ueber public-Journal erfolgreich angewendet.");
  }
}catch(error){
  const {details}=errorDetails(error);
  console.error("[db-migrate] Migration fehlgeschlagen:",maskSecrets(JSON.stringify(details)));
  process.exitCode=1;
}finally{
  await pool.end();
}
