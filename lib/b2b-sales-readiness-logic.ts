import type {B2BPriority} from "./b2b-influencer-network-logic";

export type B2BSalesReadiness={
  nodeKey:string;
  tier:"hot"|"warm"|"nurture"|"blocked";
  score:number;
  confidence:"high"|"medium"|"low";
  estimatedValueCents:number|null;
  objective:"qualify"|"expand"|"partner"|"nurture"|"none";
  nextInternalStep:string;
};

const clamp=(n:number)=>Math.max(0,Math.min(100,Number.isFinite(n)?n:0));

export function buildB2BSalesReadiness(priorities:B2BPriority[],limit=50):B2BSalesReadiness[]{
  return priorities.slice(0,Math.max(1,Math.min(200,limit))).map(item=>{
    if(item.action==="BLOCK"){
      return {nodeKey:item.key,tier:"blocked" as const,score:0,confidence:"high" as const,estimatedValueCents:item.estimatedValueCents??null,objective:"none" as const,nextInternalStep:"Keine Aktion: Opt-out/Compliance respektieren"};
    }
    const valueSignal=item.estimatedValueCents==null?0:clamp(Math.log10(Math.max(1,item.estimatedValueCents))*18);
    const readiness=clamp(item.score*.55+item.intent*.2+item.trust*.1+item.relationshipStrength*.05+valueSignal*.1);
    const tier:B2BSalesReadiness["tier"]=readiness>=75&&item.intent>=65?"hot":readiness>=55?"warm":"nurture";
    const evidenceCount=[item.fit,item.intent,item.trust,item.relationshipStrength,item.estimatedValueCents??null,item.lastActivityDays??null].filter(v=>v!==null).length;
    const confidence:B2BSalesReadiness["confidence"]=evidenceCount>=6?"high":evidenceCount>=4?"medium":"low";
    const objective:B2BSalesReadiness["objective"]=item.action==="EXPAND"?"expand":item.action==="PARTNER"?"partner":item.action==="QUALIFY"?"qualify":"nurture";
    const nextInternalStep=tier==="hot"
      ? objective==="expand"?"Expansion-Angebot und belegten ROI-Case als Entwurf vorbereiten"
        :objective==="partner"?"Partner-Value-Exchange und gemeinsames Pilotziel als Entwurf vorbereiten"
        :"Discovery-Fragen, Value-Proposition und passende Checkout-/Demo-CTA vorbereiten"
      :tier==="warm"
        ?"Relevanten Proof-/Use-Case und eine kleine nächste Verpflichtung als Entwurf vorbereiten"
        :"Nurture-Signal sammeln und erst bei höherem Intent aktiv qualifizieren";
    return {nodeKey:item.key,tier,score:Math.round(readiness),confidence,estimatedValueCents:item.estimatedValueCents??null,objective,nextInternalStep};
  }).sort((a,b)=>b.score-a.score||a.nodeKey.localeCompare(b.nodeKey));
}
