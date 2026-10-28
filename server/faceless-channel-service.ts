import { eq } from "drizzle-orm";
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
  const dedupeKey=`faceless-channel:${title}`;
  const [row]=await db.insert(draftQueue).values({
    kind:"content",
    title,
    payload,
    status:"pending",
    createdBy:CREATED_BY,
    dedupeKey,
  }).onConflictDoNothing({target:draftQueue.dedupeKey}).returning({id:draftQueue.id});
  if(row) return {inserted:true,id:row.id};
  const [existing]=await db.select({id:draftQueue.id}).from(draftQueue).where(eq(draftQueue.dedupeKey,dedupeKey)).limit(1);
  if(!existing) throw new Error("Draft-Deduplizierung konnte nicht aufgelöst werden.");
  return {inserted:false,id:existing.id};
}

/**
 * Sprint 482 — materialize the launch system into the existing human-approval queue.
 * No publish API, affiliate signup, payment or external send is invoked here.
 */
export function buildFacelessChannelDraftSpecs(){
  const longforms=STARTER_VIDEOS.map(buildVideoPackage);
  const shorts=buildShortPlan();
  const calendar=build30DayPlan();
  const drafts:Array<{title:string;payload:Record<string,unknown>}>=[];

  drafts.push({
    title:"Automationsklar — Lead Magnet: 15-Minuten-Automations-Check",
    payload:{
      personaId:"automationsklar-editorial",
      platform:"youtube",
      topic:LEAD_MAGNET.name,
      content:`${LEAD_MAGNET.purpose}\n\nFelder: ${LEAD_MAGNET.fields.join(" · ")}\n\nVersprechen: ${LEAD_MAGNET.promise}\n\nExterne Aktion: ${LEAD_MAGNET.externalAction}`,
      assets:[],
      assetCount:0,
      disclosure:"Lead-Magnet; Double-opt-in/Versand erst nach Freigabe und vorhandener Infrastruktur.",
      channel:"Automationsklar",format:"lead-magnet",leadMagnet:LEAD_MAGNET,calendar,externalAction:"approval-required",
    },
  });

  for(const video of longforms){
    drafts.push({
      title:`Automationsklar — Longform: ${video.recommendedTitle}`,
      payload:{
        personaId:"automationsklar-editorial",
        platform:"youtube",
        topic:video.problem,
        content:`${video.hook}\n\nBeispiel: ${video.example}\n\nErgebnis: ${video.result}\n\nCTA: ${video.cta}`,
        assets:video.scenes.map((scene,index)=>({format:"scene",variant:index+1,title:scene,content:scene})),
        assetCount:video.scenes.length,
        disclosure:"Keine Affiliate-Partnerschaft behaupten; Quellen/Assets vor Veröffentlichung prüfen; externe Veröffentlichung freigabepflichtig.",
        channel:"Automationsklar",format:"youtube-longform",video,
        compliance:buildDisclosureChecklist({affiliate:false,sponsored:false,realisticSynthetic:false}),
        publishing:"approval-required",
      },
    });
  }
  for(const short of shorts){
    drafts.push({
      title:`Automationsklar — Short: ${short.hook}`,
      payload:{
        personaId:"automationsklar-editorial",
        platform:"youtube-short/instagram-reel/tiktok",
        topic:short.hook,
        content:`${short.hook}\n\nYouTube Short: ${short.youtubeShort.style}\nInstagram Reel: ${short.instagramReel.style}\nTikTok: ${short.tiktok.style}`,
        assets:[
          {format:"youtube-short",variant:1,content:short.youtubeShort.style,cta:short.youtubeShort.cta},
          {format:"instagram-reel",variant:1,content:short.instagramReel.style,cta:short.instagramReel.cta},
          {format:"tiktok",variant:1,content:short.tiktok.style,cta:short.tiktok.cta},
        ],
        assetCount:3,
        disclosure:"Plattformspezifisch neu schneiden; keine unveränderte Massen-Duplizierung; externe Veröffentlichung freigabepflichtig.",
        channel:"Automationsklar",format:"short-repurpose",short,
        compliance:buildDisclosureChecklist({affiliate:false,sponsored:false,realisticSynthetic:false}),
        publishing:"approval-required",
      },
    });
  }

  return drafts;
}

export async function materializeFacelessChannelLaunch(){
  const drafts=buildFacelessChannelDraftSpecs();
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
