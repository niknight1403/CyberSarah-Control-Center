/**
 * Real PostgreSQL concurrency acceptance gate (CI only): two independent
 * connection pools compete for the exact same application CAS transition.
 * All data is disposable in the publishing_ci database. No external APIs.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { claimDuePublishingJob, quarantineStalePublishingClaimsDb, armPublishingDispatch, confirmPublishingReceipt, quarantineAmbiguousPublishingDispatch } from "../server/publishing-claim";
import { createServer } from "node:http";
import axios from "axios";
import {reconcileUncertainPublishingJob} from "../server/publishing-review";

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

    // A crashed worker remains quarantined, never re-enters the auto-queue.
    await setup.query('UPDATE "publishingJobs" SET updated_at=$1 WHERE id=$2',
      [new Date(now.getTime()-35*60_000),created]);
    assert.equal(await quarantineStalePublishingClaimsDb(wb,now),1);
    assert.equal(await quarantineStalePublishingClaimsDb(wa,now),0);
    const uncertain=(await setup.query(
      'SELECT status,last_error,attempts FROM "publishingJobs" WHERE id=$1',[created]
    )).rows[0];
    assert.equal(uncertain.status,"versand_ungeklaert");
    assert.match(uncertain.last_error,/Plattform prüfen/);
    assert.equal(uncertain.attempts,1);
    assert.equal(await claimDuePublishingJob(wa,created,"owner-a",now),null);

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
    console.log("PASS: PostgreSQL 24-worker CAS, tenant isolation, due-time, stale quarantine, migration replay.");
  } finally {
    await Promise.all([setup.end(),a.end(),b.end()]);
  }
}

main().catch(error=>{console.error("PostgreSQL publishing-claim integration failed:",error);process.exitCode=1;});
