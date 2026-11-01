import {revenueJobs} from "../drizzle/schema";
import type {RevenueIncident} from "../lib/revenue-incident-logic";
import {getDb} from "./db";

export async function queueRevenueIncidents(incidents:RevenueIncident[],now=new Date()){
  const db=await getDb();
  if(!db)throw new Error("Datenbank nicht verfügbar.");
  const day=now.toISOString().slice(0,10);
  let queued=0,reused=0;
  const ids:number[]=[];
  for(const incident of incidents.slice(0,20)){
    const dedupeKey=`revenue-repair:${day}:${incident.code}`;
    const [created]=await db.insert(revenueJobs).values({
      dedupeKey,
      kind:"revenue-repair",
      status:"queued",
      payload:{
        code:incident.code,
        severity:incident.severity,
        domain:incident.domain,
        detail:incident.detail,
        autoRepairable:incident.autoRepairable,
        owner:incident.owner,
        safeRepair:incident.safeRepair,
      },
    }).onConflictDoNothing({target:revenueJobs.dedupeKey}).returning({id:revenueJobs.id});
    if(created){queued+=1;ids.push(created.id);}else reused+=1;
  }
  return {queued,reused,ids};
}
