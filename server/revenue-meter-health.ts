/** Read-only bridge from existing Drizzle database pool to metering telemetry. */
import {sql} from "drizzle-orm";
import {getDb} from "./db";
import {readMeterQueueHealth} from "./revenue-meter-ledger";

export async function getRevenueMeterHealth(){
  const db=await getDb();
  if(!db) return {available:false as const,reason:"database_not_configured" as const};
  try {
    const health=await readMeterQueueHealth({
      query:async(statement,values)=>{
        if(values?.length)throw new Error("Read-only health query cannot accept parameters");
        const result=await db.execute(sql.raw(statement));
        return {rows:result.rows as Record<string,unknown>[]};
      },
    });
    return {available:true as const,...health};
  }catch(error){
    // Missing migrations and DB outages are not zero-event success states.
    console.warn("[RevenueMeterHealth] Read-only query unavailable",
      error instanceof Error?error.message:"unknown");
    return {available:false as const,reason:"meter_queue_unavailable" as const};
  }
}
