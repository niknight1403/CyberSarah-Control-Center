import { and, eq } from "drizzle-orm";
import { draftQueue } from "../drizzle/schema";
import {
  LEAD_MAGNET,
  STARTER_VIDEOS,
  build30DayPlan,
  buildDisclosureChecklist,
  buildShortPlan,
  buildVideoPackage,
  launchReadiness,
} from "../lib/faceless-channel-logic";
import { getDb } from "./db";

const CREATED_BY="faceless-channel-engine";

async function insertDraftOnce(title:string,payload:Record<string,unknown>){
  const db=await getDb();
  if(!db) throw new Error("Datenbank nicht verfügbar.");
  const [existing]=await db.select({id:draftQueue.id}).from(draftQueue)
    .where(and(eq(draftQueue.createdBy,CREATED_BY),eq(draftQueue.title,title))).limit(1);
  if(existing) return {inserted:false,id:existing.id};
  const [row]=await db.insert(draftQueue).values({
    kind:"content",
    title,
    payload,
    status:"pending",
    createdBy:CREATED_BY,
  }).returning({id:draftQueue.id});
  return {inserted:true,id:row.id};
}

/**
 * Sprint 482 — materialize the launch system into the existing human-approval queue.
 * No publish API, affiliate signup, payment or external send is invoked here.
 */
export async function materializeFacelessChannelLaunch(){
  const longforms=STARTER_VIDEOS.map(buildVideoPackage);
  const shorts=buildShortPlan();
  const calendar=build30DayPlan();
  const drafts:Array<{title:string;payload:Record<string,unknown>}>=[];

  drafts.push({
    title:"Automationsklar — Lead Magnet: 15-Minuten-Automations-Check",
    payload:{channel:"Automationsklar",format:"lead-magnet",leadMagnet:LEAD_MAGNET,calendar,externalAction:"approval-required"},
  });

  for(const video of longforms){
    drafts.push({
      title:`Automationsklar — Longform: ${video.recommendedTitle}`,
      payload:{
        channel:"Automationsklar",format:"youtube-longform",video,
        disclosure:buildDisclosureChecklist({affiliate:false,sponsored:false,realisticSynthetic:false}),
        publishing:"approval-required",
      },
    });
  }
  for(const short of shorts){
    drafts.push({
      title:`Automationsklar — Short: ${short.hook}`,
      payload:{
        channel:"Automationsklar",format:"short-repurpose",short,
        disclosure:buildDisclosureChecklist({affiliate:false,sponsored:false,realisticSynthetic:false}),
        publishing:"approval-required",
      },
    });
  }

  const results=[];
  for(const draft of drafts) results.push(await insertDraftOnce(draft.title,draft.payload));
  return {
    total:drafts.length,
    inserted:results.filter(x=>x.inserted).length,
    existing:results.filter(x=>!x.inserted).length,
    ids:results.map(x=>x.id),
    externalActionsExecuted:0,
  };
}

export function facelessChannelOverview(){
  return launchReadiness();
}
