/**
 * Real PostgreSQL concurrency acceptance gate (CI only): two independent
 * connection pools compete for the exact same application CAS transition.
 * All data is disposable in the publishing_ci database. No external APIs.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { claimDuePublishingJob, recoverStalePublishingClaimsDb, quarantineStalePublishingClaimsDb, armPublishingDispatch, confirmPublishingReceipt, quarantineAmbiguousPublishingDispatch } from "../server/publishing-claim";
import { createServer } from "node:http";
import axios from "axios";
import {reconcileUncertainPublishingJob, listUncertainPublishingForAdmin, listPublishingReviewHistory} from "../server/publishing-review";
import {retryFailedPublishingJobsDb} from "../server/publishing-service";
import {publishingOpsOverviewDb} from "../server/publishing-ops";

async function main(): Promise<void> {
  const value = process.env.PUBLISHING_INTEGRATION_DATABASE_URL ?? "";
  const target = new URL(value);
  if (target.protocol !== "postgresql:" ||
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      target.pathname !== "/publishing_ci")
    throw new Error("Safety gate: PostgreSQL test must use local publishing_ci only.");

  const setup = new Pool({connectionString:value,max:2});
  const a = new Pool({connectionString:value,max:2});
  const b = new Pool({connectionString:value,max:2});
  try {
    await setup.query(`CREATE TYPE "publishing_status" AS ENUM
      ('geplant','sandbox_veroeffentlicht','veroeffentlicht','fehlgeschlagen','abgebrochen')`);
    await setup.query(`CREATE TABLE "publishingJobs" (
      id SERIAL PRIMARY KEY,
      user_open_id TEXT NOT NULL,
      product TEXT NOT NULL,
      goal TEXT NOT NULL,
      persona TEXT NOT NULL,
      platform TEXT NOT NULL,
      campaign_day INTEGER NOT NULL,
      dedupe_key TEXT NOT NULL,
      status "publishing_status" NOT NULL DEFAULT 'geplant',
      scheduled_for TIMESTAMPTZ NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      mode TEXT,
      external_id TEXT,
      asset_url TEXT,
      asset_urls JSONB NOT NULL DEFAULT '[]',
      insights JSONB NOT NULL DEFAULT '{}',
      insights_fetched_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const migration = await readFile("drizzle/0021_publishing_atomic_dispatch.sql", "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map(x=>x.trim()).filter(Boolean)) {
      await setup.query(statement);
      await setup.query(statement); // migration must be idempotent
    }
    const present = (await setup.query(
      "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'publishing_status'::regtype"
    )).rows.map(x=>x.enumlabel);
    assert(present.includes("in_bearbeitung"));
    assert(present.includes("versand_ungeklaert"));

    const now = new Date("2026-10-31T12:00:00.000Z");
    const created = (await setup.query(`INSERT INTO "publishingJobs"
      (user_open_id,product,goal,persona,platform,campaign_day,dedupe_key,scheduled_for)
      VALUES('owner-a','product','reach','nova','x',1,'one', $1) RETURNING id`,
      [new Date(now.getTime()-60_000)])).rows[0].id as number;
    const wa=drizzle(a), wb=drizzle(b);
    // Both workers read the same due candidate before either claims it.
    const parallel = await Promise.all(
      Array.from({length:24},(_,idx)=>claimDuePublishingJob(idx%2?wa:wb,created,"owner-a",now))
    );
    assert.equal(parallel.filter(Boolean).length,1,"exactly one of 24 concurrent workers must win");
    const one = parallel.find(Boolean)!;
    assert.equal(one.status,"in_bearbeitung");
    assert.equal(one.attempts,1);
    const stored=(await setup.query('SELECT status,attempts FROM "publishingJobs" WHERE id=$1',[created])).rows[0];
    assert.equal(stored.status,"in_bearbeitung");
    assert.equal(stored.attempts,1,"losers must not increment attempts");
    assert.equal(await claimDuePublishingJob(wb,created,"owner-a",now),null);

    // Ownership and due-time boundaries must fail closed.
    const laterId=(await setup.query(`INSERT INTO "publishingJobs"
      (user_open_id,product,goal,persona,platform,campaign_day,dedupe_key,scheduled_for)
      VALUES('owner-b','product','reach','nova','x',1,'future',$1) RETURNING id`,
      [new Date(now.getTime()+3_600_000)])).rows[0].id as number;
    assert.equal(await claimDuePublishingJob(wa,laterId,"owner-a",now),null);
    assert.equal(await claimDuePublishingJob(wa,laterId,"owner-b",now),null);

    // Crash before arming any external send is PROVEN safe to retry.
    // Two independent database pools must never requeue the same row twice.
    await setup.query('UPDATE "publishingJobs" SET updated_at=$1 WHERE id=$2',
      [new Date(now.getTime()-35*60_000),created]);
    const recoveries=await Promise.all([
      recoverStalePublishingClaimsDb(wa,now),
      recoverStalePublishingClaimsDb(wb,now),
    ]);
    assert.equal(recoveries.reduce((n,r)=>n+r.requeued,0),1);
    assert.equal(recoveries.reduce((n,r)=>n+r.uncertain,0),0);
    assert.equal(await quarantineStalePublishingClaimsDb(wa,now),0);
    const recovered=(await setup.query(
      'SELECT status,scheduled_for,last_error,attempts FROM "publishingJobs" WHERE id=$1',[created]
    )).rows[0];
    assert.equal(recovered.status,"geplant");
    assert.equal(recovered.attempts,1,"crash recovery must not spend a second attempt");
    assert.equal(new Date(recovered.scheduled_for).getTime(),
      now.getTime()+60*60_000,"first stale preflight retries after 60 minutes");
    assert.equal(await claimDuePublishingJob(wa,created,"owner-a",now),null);
    assert.equal((await claimDuePublishingJob(wa,created,"owner-a",
      new Date(now.getTime()+61*60_000)))?.attempts,2);

    // Exhausted, second attempt, potentially dispatched, unknown mode, and
    // fresh claims are all handled without making an external provider POST.
    const makeActive=async(key:string,attempts:number,mode:string|null,minsOld:number)=>
      (await setup.query(`INSERT INTO "publishingJobs"
        (user_open_id,product,goal,persona,platform,campaign_day,dedupe_key,scheduled_for,status,attempts,mode,updated_at)
        VALUES('recover-owner','product','reach','nova','x',1,$1,$2,'in_bearbeitung',$3,$4,$5)
        RETURNING id`,[key,new Date(now.getTime()-60_000),
        attempts,mode,new Date(now.getTime()-minsOld*60_000)])).rows[0].id as number;
    const secondId=await makeActive("preflight-second",2,null,35);
    const exhaustedId=await makeActive("preflight-exhausted",3,null,35);
    const armedId=await makeActive("dispatch-armed",1,"dispatching",35);
    const weirdId=await makeActive("unknown-mode",1,"legacy-sent",35);
    const freshId=await makeActive("fresh-preflight",1,null,3);
    const recoveredBatch=await recoverStalePublishingClaimsDb(wb,now);
    assert.deepEqual(recoveredBatch,{requeued:1,failed:1,uncertain:2});
    const getRow=async(id:number)=>(await setup.query(
      'SELECT status,scheduled_for,mode,attempts FROM "publishingJobs" WHERE id=$1',[id])).rows[0];
    assert.equal((await getRow(secondId)).status,"geplant");
    assert.equal(new Date((await getRow(secondId)).scheduled_for).getTime(),
      now.getTime()+360*60_000);
    assert.equal((await getRow(exhaustedId)).status,"fehlgeschlagen");
    assert.equal((await getRow(armedId)).status,"versand_ungeklaert");
    assert.equal((await getRow(weirdId)).status,"versand_ungeklaert");
    assert.equal((await getRow(freshId)).status,"in_bearbeitung");
    assert.deepEqual(await recoverStalePublishingClaimsDb(wa,now),
      {requeued:0,failed:0,uncertain:0},"recovery must be idempotent");
    assert.equal(await claimDuePublishingJob(wa,armedId,"recover-owner",now),null);
    assert.equal(await claimDuePublishingJob(wa,weirdId,"recover-owner",now),null);
    console.log("PASS: crash recovery pre-send backoff, exhausted budget, armed quarantine, parallel idempotence.");

    // Controlled HTTP provider: accept the post, then drop its acknowledgement.
    // Real Axios network I/O and the same durable transitions as production.
    const received: string[] = [];
    const provider = createServer((req, res) => {
      let body = "";
      req.on("data", (part: Buffer) => {body += part.toString("utf8");});
      req.on("end", () => {
        received.push(body);
        if (req.url === "/drop-ack") {
          req.socket.destroy(); // accepted, but client sees ECONNRESET
        } else {
          res.writeHead(200, {"content-type":"application/json"});
          res.end(JSON.stringify({id: "provider-post-" + received.length}));
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      provider.once("error", reject);
      provider.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = provider.address();
      assert(address && typeof address !== "string");
      const baseUrl = "http://127.0.0.1:" + address.port;
      const createJob = async (key: string): Promise<number> =>
        (await setup.query(`INSERT INTO "publishingJobs"
          (user_open_id,product,goal,persona,platform,campaign_day,dedupe_key,scheduled_for)
          VALUES('owner-test','product','reach','nova','x',1,$1,$2) RETURNING id`,
          [key,new Date(now.getTime()-60_000)])).rows[0].id as number;

      const lostId = await createJob("accept-then-drop");
      assert(await claimDuePublishingJob(wa,lostId,"owner-test",now));
      assert.equal(await armPublishingDispatch(wa,lostId,"owner-test"),true);
      assert.equal(await armPublishingDispatch(wb,lostId,"owner-test"),false);
      let lostAck = false;
      try {
        await axios.post(baseUrl + "/drop-ack",{text:"one-post"}, {timeout:1500});
      } catch {
        lostAck = true;
        assert.equal(await quarantineAmbiguousPublishingDispatch(wb,lostId,"owner-test"),true);
      }
      assert.equal(lostAck,true,"real network error must reach the fail-closed path");
      assert.equal(received.length,1,"the remote provider accepted the post once");
      assert.equal(await claimDuePublishingJob(wa,lostId,"owner-test",now),null);
      assert.equal(await quarantineAmbiguousPublishingDispatch(wa,lostId,"owner-test"),false);
      const ambiguous=(await setup.query('SELECT status,attempts,external_id FROM "publishingJobs" WHERE id=$1',[lostId])).rows[0];
      assert.equal(ambiguous.status,"versand_ungeklaert");
      assert.equal(ambiguous.external_id,null);
      assert.equal(ambiguous.attempts,1);

      // Provider response with a real ID: only an armed, matching worker
      // can persist it as veroeffentlicht. A replay stays impossible.
      const successId = await createJob("receipt-success");
      assert(await claimDuePublishingJob(wb,successId,"owner-test",now));
      assert.equal(await confirmPublishingReceipt(wa,successId,"owner-test","not-armed"),false);
      assert.equal(await armPublishingDispatch(wa,successId,"other-owner"),false);
      assert.equal(await armPublishingDispatch(wa,successId,"owner-test"),true);
      const response=await axios.post<{id:string}>(baseUrl+"/success",{text:"safe-post"},{timeout:1500});
      assert.equal(await confirmPublishingReceipt(wa,successId,"owner-test",response.data.id),true);
      assert.equal(await confirmPublishingReceipt(wb,successId,"owner-test",response.data.id),false);
      assert.equal(await claimDuePublishingJob(wb,successId,"owner-test",now),null);
      const published=(await setup.query('SELECT status,external_id FROM "publishingJobs" WHERE id=$1',[successId])).rows[0];
      assert.equal(published.status,"veroeffentlicht");
      assert.equal(published.external_id,response.data.id);
      assert.equal(received.length,2);

      // No or fabricated provider reference: never call this a success.
      const noReceiptId=await createJob("missing-provider-id");
      assert(await claimDuePublishingJob(wa,noReceiptId,"owner-test",now));
      assert.equal(await armPublishingDispatch(wa,noReceiptId,"owner-test"),true);
      await assert.rejects(
        () => confirmPublishingReceipt(wb,noReceiptId,"owner-test","x-unknown"),
        /Beitragsschlüssel/,
      );
      assert.equal(await quarantineAmbiguousPublishingDispatch(wb,noReceiptId,"owner-test"),true);
      assert.equal(await claimDuePublishingJob(wa,noReceiptId,"owner-test",now),null);
      console.log("PASS: HTTP accepted-but-lost ACK is quarantined; confirmed receipt persisted once; missing receipt blocked.");
    } finally {
      await new Promise<void>((resolve, reject) => {
        provider.close(err => err ? reject(err) : resolve());
      });
    }

    // Real PostgreSQL review transitions, immutable evidence and concurrent reviewers.
    const reviewMigration=await readFile("drizzle/0022_publishing_manual_review_audit.sql","utf8");
    for(const statement of reviewMigration.split("--> statement-breakpoint").map(x=>x.trim()).filter(Boolean)){
      await setup.query(statement);
      await setup.query(statement); // repeat-safe migration
    }
    const makeUncertain=async(key:string,owner:string)=> {
      const id=(await setup.query(`INSERT INTO "publishingJobs"
        (user_open_id,product,goal,persona,platform,campaign_day,dedupe_key,scheduled_for,status)
        VALUES($1,'product','reach','nova','x',1,$2,$3,'versand_ungeklaert') RETURNING id`,
        [owner,key,new Date(now.getTime()-60_000)])).rows[0].id as number;
      return id;
    };
    const owner="owner-a";
    const publishedId=await makeUncertain("review-published",owner);
    const evidence="Checked the live provider post page and verified the exact content and ID.";
    const decision={resolution:"confirmed_published" as const,externalId:"post-verified-12345",evidence};
    const result=await Promise.all(Array.from({length:12},(_,i)=>
      reconcileUncertainPublishingJob(i%2?wa:wb,owner,"admin-actor",publishedId,decision,now)));
    assert.equal(result.filter(Boolean).length,1,"exactly one reviewer may confirm a post");
    assert.equal((await setup.query('SELECT status,external_id FROM "publishingJobs" WHERE id=$1',[publishedId])).rows[0].status,"veroeffentlicht");
    const history=(await setup.query('SELECT * FROM publishing_review_events WHERE job_id=$1',[publishedId])).rows;
    assert.equal(history.length,1,"audit event inserted atomically exactly once");
    assert.equal(history[0].actor_open_id,"admin-actor");
    assert.equal(history[0].evidence,evidence);
    assert.equal(await claimDuePublishingJob(wb,publishedId,owner,now),null);

    const closedId=await makeUncertain("review-closed",owner);
    assert.equal(await reconcileUncertainPublishingJob(wa,"another-owner","admin-actor",closedId,{
      resolution:"closed_without_replay",evidence:"Verified on provider account: no matching post found."
    },now),false,"cross-tenant mutation must fail closed");
    assert.equal(await reconcileUncertainPublishingJob(wb,owner,"admin-actor",closedId,{
      resolution:"closed_without_replay",evidence:"Verified on provider account: no matching post found."
    },now),true);
    assert.equal((await setup.query('SELECT status FROM "publishingJobs" WHERE id=$1',[closedId])).rows[0].status,"abgebrochen");
    assert.equal(await claimDuePublishingJob(wa,closedId,owner,now),null);
    assert.equal((await setup.query('SELECT count(*)::int AS count FROM publishing_review_events WHERE job_id=$1',[closedId])).rows[0].count,1);
    console.log("PASS: human review CAS, tenant isolation, two resolution modes, durable audit, no automatic resend.");

    // Ten-sprint review-desk E2E: unfiltered totals, oldest-first, filters,
    // owner isolation, literal '%' and '_' search, and stable paging.
    const triageOwner="review-triage-owner";
    for(let i=0;i<23;i++) {
      const label=i===4?"50%_impact":"product "+i;
      await setup.query(`INSERT INTO "publishingJobs"
        (user_open_id,product,goal,persona,platform,campaign_day,dedupe_key,scheduled_for,status,updated_at)
        VALUES($1,$2,'reach',$3,$4,1,$5,$6,'versand_ungeklaert',$7)`,
        [triageOwner,label,i===8?"marketing-expert":"nova",i%2?"instagram":"x",
         "review-triage-"+i,new Date(now.getTime()-60_000),
         new Date(now.getTime()-(i+1)*2*3_600_000)]);
    }
    await makeUncertain("other-owner-does-not-leak","another-owner");
    const p1=await listUncertainPublishingForAdmin(wa,triageOwner,{limit:10,offset:0},now);
    const p2=await listUncertainPublishingForAdmin(wb,triageOwner,{limit:10,offset:10},now);
    const p3=await listUncertainPublishingForAdmin(wa,triageOwner,{limit:10,offset:20},now);
    assert.equal(p1.total,23,"total must not show only the first page");
    assert.equal(p1.matching,23);
    assert.equal(p1.jobs.length,10);
    assert.equal(p2.jobs.length,10);
    assert.equal(p3.jobs.length,3);
    assert.equal(p1.hasMore,true);
    assert.equal(p3.hasMore,false);
    assert.equal(new Set([...p1.jobs,...p2.jobs,...p3.jobs].map(x=>x.id)).size,23);
    assert(p1.jobs.every((job,idx,rows)=>idx===0||rows[idx-1].updatedAt<=job.updatedAt),
      "oldest review item must be first");
    assert(p1.critical>0&&p1.urgent>=p1.critical);
    const byPlatform=await listUncertainPublishingForAdmin(wa,triageOwner,{platform:"instagram",limit:50},now);
    assert.equal(byPlatform.matching,11);
    assert(byPlatform.jobs.every(j=>j.platform==="instagram"));
    const byPersona=await listUncertainPublishingForAdmin(wa,triageOwner,{search:"marketing-expert"},now);
    assert.equal(byPersona.matching,1);
    const literal=await listUncertainPublishingForAdmin(wa,triageOwner,{search:"50%_impact"},now);
    assert.equal(literal.matching,1,"ILIKE wildcard escapes must stay literal");
    assert.equal(literal.jobs[0].product,"50%_impact");

    // Two separate uncertain jobs MUST NOT be manually assigned the SAME
    // provider receipt. A per-provider advisory transaction lock prevents
    // simultaneous duplicate confirmations even on independent connection pools.
    const sameA=await makeUncertain("duplicate-provider-a",owner);
    const sameB=await makeUncertain("duplicate-provider-b",owner);
    const duplicateDecision={
      resolution:"confirmed_published" as const,
      externalId:"real-provider-duplicate-100",
      evidence:"Verified this exact external provider ID on the post's live page.",
    };
    const collisions=await Promise.allSettled([
      reconcileUncertainPublishingJob(wa,owner,"admin-a",sameA,duplicateDecision,now),
      reconcileUncertainPublishingJob(wb,owner,"admin-b",sameB,duplicateDecision,now),
    ]);
    const successes=collisions.filter(x=>x.status==="fulfilled"&&x.value===true);
    const conflicts=collisions.filter(x=>x.status==="rejected");
    assert.equal(successes.length,1,"one canonical receipt may confirm only one job");
    assert.equal(conflicts.length,1,"duplicate receipt must surface an explicit conflict");
    assert.match(String((conflicts[0] as PromiseRejectedResult).reason),/bereits/);
    const counts=(await setup.query(
      'SELECT status,COUNT(*)::int AS cnt FROM "publishingJobs" WHERE id=ANY($1) GROUP BY status',
      [[sameA,sameB]]
    )).rows;
    assert.equal(counts.find(x=>x.status==="veroeffentlicht").cnt,1);
    assert.equal(counts.find(x=>x.status==="versand_ungeklaert").cnt,1);
    const allEvents=await listPublishingReviewHistory(wa,owner);
    assert(allEvents.some(e=>e.externalId==="real-provider-duplicate-100"));
    assert.equal((await setup.query(
      'SELECT COUNT(*)::int AS count FROM publishing_review_events WHERE external_id=$1',
      [duplicateDecision.externalId]
    )).rows[0].count,1,"only one audit event may identify the provider receipt");
    console.log("PASS: review pagination, owner isolation, literal search, platform filter, SLA, collision lock, audit.");
    // Read-only operator dashboard: every counter is per-tenant and based
    // on actual stored states, including a non-retryable forged failed state.
    const opsOwner="publishing-ops-owner";
    const addOps=async(key:string,status:string,mode:string|null,scheduled:Date,attempts:number)=>{
      const id=(await setup.query(`INSERT INTO "publishingJobs"
        (user_open_id,product,goal,persona,platform,campaign_day,dedupe_key,scheduled_for,status,attempts,mode,published_at)
        VALUES($1,'ops-product','reach','nova','x',1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [opsOwner,key,scheduled,status,attempts,mode,
          status==="veroeffentlicht"?now:null])).rows[0].id as number;
      return id;
    };
    await addOps("due","geplant",null,new Date(now.getTime()-60_000),0);
    await addOps("future","geplant",null,new Date(now.getTime()+60_000),0);
    await addOps("uncertain","versand_ungeklaert","dispatching",now,1);
    const safeFailed=await addOps("failed-safe","fehlgeschlagen",null,now,3);
    const unsafeFailed=await addOps("failed-armed","fehlgeschlagen","dispatching",now,3);
    await addOps("live","veroeffentlicht","live",now,1);
    const metrics=await publishingOpsOverviewDb(wa,opsOwner,now);
    assert.equal(metrics.total,6);
    assert.equal(metrics.due,1);
    assert.equal(metrics.scheduled,1);
    assert.equal(metrics.uncertain,1);
    assert.equal(metrics.failed,2);
    assert.equal(metrics.retryableFailed,1);
    assert.equal(metrics.published24h,1);
    assert.equal(await retryFailedPublishingJobsDb(wb,"different-owner",now),0);
    assert.equal(await retryFailedPublishingJobsDb(wb,opsOwner,now),1);
    assert.equal((await getRow(safeFailed)).attempts,0);
    assert.equal((await getRow(safeFailed)).status,"geplant");
    assert.equal((await getRow(unsafeFailed)).status,"fehlgeschlagen");
    assert.equal(await retryFailedPublishingJobsDb(wa,opsOwner,now),0);
    assert.equal((await publishingOpsOverviewDb(wb,opsOwner,now)).retryableFailed,0);
    console.log("PASS: tenant-only ops telemetry, accurate queue status, safe operator retry and armed exclusion.");
    console.log("PASS: PostgreSQL 24-worker CAS, tenant isolation, due-time, stale quarantine, migration replay.");
  } finally {
    await Promise.all([setup.end(),a.end(),b.end()]);
  }
}

main().catch(error=>{console.error("PostgreSQL publishing-claim integration failed:",error);process.exitCode=1;});
