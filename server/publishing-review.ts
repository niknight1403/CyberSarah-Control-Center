/**
 * Human-only resolution of uncertain social-media publishing.
 * Query, filtering, and transactional decisions never dispatch a post.
 */
import {and, asc, count, desc, eq, ilike, ne, or, sql} from "drizzle-orm";
import {TRPCError} from "@trpc/server";
import {publishingJobs,publishingReviewEvents} from "../drizzle/schema";
import {cleanReviewSearch,validManualReviewReceipt,type ReviewPlatform} from "../lib/publishing-review-logic";
import {getDb} from "./db";

type PublishingDb=NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type PublishingReviewDecision =
  | {resolution:"confirmed_published"; externalId:string; evidence:string}
  | {resolution:"closed_without_replay"; evidence:string};

export type PublishingReviewOptions = {
  limit?:number;
  offset?:number;
  platform?:ReviewPlatform;
  search?:string;
};

export function validatePublishingReview(decision:PublishingReviewDecision):void {
  if(decision.evidence.trim().length<16||decision.evidence.trim().length>1200)
    throw new Error("Bitte eine konkrete Prüfgrundlage (16–1200 Zeichen) angeben.");
  if(decision.resolution==="confirmed_published"&&!validManualReviewReceipt(decision.externalId))
    throw new Error("Für die Bestätigung ist eine echte externe Plattform-Beitrags-ID erforderlich (keine URL oder Platzhalter).");
}

export async function listUncertainPublishingForAdmin(
  db:PublishingDb, userOpenId:string, options:PublishingReviewOptions={},
  now=new Date(),
) {
  const limit=Math.min(Math.max(options.limit??20,1),50);
  const offset=Math.min(Math.max(options.offset??0,0),5000);
  const search=cleanReviewSearch(options.search);
  // Parameter binding ensures that the search text cannot become SQL.
  // Escape SQL LIKE special characters so the UI search is literal.
  const escaped=search.replace(/[\\%_]/g,c=>"\\"+c);
  const owner=and(eq(publishingJobs.userOpenId,userOpenId),eq(publishingJobs.status,"versand_ungeklaert"));
  const conditions=[
    eq(publishingJobs.userOpenId,userOpenId),
    eq(publishingJobs.status,"versand_ungeklaert"),
  ];
  if(options.platform) conditions.push(eq(publishingJobs.platform,options.platform));
  if(escaped){
    const term=`%${escaped}%`;
    conditions.push(or(ilike(publishingJobs.product,term),ilike(publishingJobs.persona,term))!);
  }
  const where=and(...conditions);
  const cutoff1h=new Date(now.getTime()-60*60_000);
  const cutoff24h=new Date(now.getTime()-24*60*60_000);
  const [overall, filtered, jobs]=await Promise.all([
    db.select({
      total:count(),
      urgent:sql<number>`COUNT(*) FILTER (WHERE ${publishingJobs.updatedAt} <= ${cutoff1h})::integer`,
      critical:sql<number>`COUNT(*) FILTER (WHERE ${publishingJobs.updatedAt} <= ${cutoff24h})::integer`,
    }).from(publishingJobs).where(owner),
    db.select({total:count()}).from(publishingJobs).where(where),
    db.select({
      id:publishingJobs.id,
      product:publishingJobs.product,
      persona:publishingJobs.persona,
      platform:publishingJobs.platform,
      attempts:publishingJobs.attempts,
      updatedAt:publishingJobs.updatedAt,
      scheduledFor:publishingJobs.scheduledFor,
      lastError:publishingJobs.lastError,
    }).from(publishingJobs).where(where)
      .orderBy(asc(publishingJobs.updatedAt),asc(publishingJobs.id))
      .limit(limit).offset(offset),
  ]);
  const total=overall[0]?.total??0;
  const matching=filtered[0]?.total??0;
  return {
    jobs,total,matching,urgent:overall[0]?.urgent??0,
    critical:overall[0]?.critical??0,
    hasMore:offset+jobs.length<matching,
    offset,limit,
  };
}

export async function listPublishingReviewHistory(db:PublishingDb,userOpenId:string) {
  return db.select({
    id:publishingReviewEvents.id,
    jobId:publishingReviewEvents.jobId,
    resolution:publishingReviewEvents.resolution,
    externalId:publishingReviewEvents.externalId,
    evidence:publishingReviewEvents.evidence,
    actorOpenId:publishingReviewEvents.actorOpenId,
    reviewedAt:publishingReviewEvents.reviewedAt,
  }).from(publishingReviewEvents)
    .where(eq(publishingReviewEvents.userOpenId,userOpenId))
    .orderBy(desc(publishingReviewEvents.reviewedAt),desc(publishingReviewEvents.id))
    .limit(12);
}

export async function reconcileUncertainPublishingJob(
  db:PublishingDb,
  ownerOpenId:string,
  actorOpenId:string,
  jobId:number,
  decision:PublishingReviewDecision,
  now=new Date(),
):Promise<boolean>{
  validatePublishingReview(decision);
  if(!actorOpenId||!ownerOpenId||!Number.isSafeInteger(jobId)||jobId<1)
    throw new Error("Ungültige Identität oder Job-ID.");
  return db.transaction(async tx=>{
    const [candidate]=await tx.select({
      status:publishingJobs.status,
      platform:publishingJobs.platform,
    }).from(publishingJobs).where(and(
      eq(publishingJobs.id,jobId),eq(publishingJobs.userOpenId,ownerOpenId),
    )).limit(1);
    if(candidate?.status!=="versand_ungeklaert") return false;

    if(decision.resolution==="confirmed_published"){
      const externalId=decision.externalId.trim();
      // Serialize concurrent *different* review jobs with the same provider
      // receipt, without serializing every user or every unrelated platform.
      // The provider dispatch itself remains quarantined; no API POST.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(
        hashtext(${ownerOpenId+"|"+candidate.platform}),
        hashtext(${externalId})
      )`);
      const prior=await tx.select({id:publishingJobs.id}).from(publishingJobs).where(and(
        eq(publishingJobs.userOpenId,ownerOpenId),
        eq(publishingJobs.platform,candidate.platform),
        eq(publishingJobs.externalId,externalId),
        ne(publishingJobs.id,jobId),
        eq(publishingJobs.status,"veroeffentlicht"),
      )).limit(1);
      if(prior.length)
        throw new TRPCError({code:"CONFLICT",message:"Diese Plattform-Beitrags-ID ist bereits einem veröffentlichten Job zugeordnet."});
    }

    const [changed]=await tx.update(publishingJobs).set(decision.resolution==="confirmed_published"
      ? {status:"veroeffentlicht" as const,mode:"live",externalId:decision.externalId.trim(),
          publishedAt:now,lastError:null,updatedAt:now}
      : {status:"abgebrochen" as const,
          lastError:"Manuell geprüft und ohne erneute Veröffentlichung abgeschlossen.",
          updatedAt:now})
      .where(and(
        eq(publishingJobs.id,jobId),
        eq(publishingJobs.userOpenId,ownerOpenId),
        eq(publishingJobs.status,"versand_ungeklaert"),
      )).returning({id:publishingJobs.id});
    if(!changed)return false;

    await tx.insert(publishingReviewEvents).values({
      jobId,userOpenId:ownerOpenId,actorOpenId,
      resolution:decision.resolution,
      externalId:decision.resolution==="confirmed_published"?decision.externalId.trim():null,
      evidence:decision.evidence.trim(),reviewedAt:now,
    });
    return true;
  });
}
