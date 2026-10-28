/**
 * B2B network + autonomous influencer learning.
 * Pure deterministic logic: no scraping, no unsolicited sends, no fabricated metrics.
 */

export type B2BNode = {
  key:string; kind:"lead"|"customer"|"partner"|"creator"|"company";
  fit:number; intent:number; trust:number; relationshipStrength:number;
  estimatedValueCents?:number|null; lastActivityDays?:number|null; optedOut?:boolean;
};
export type B2BPriority = B2BNode & {
  score:number; action:"BLOCK"|"NURTURE"|"QUALIFY"|"PARTNER"|"EXPAND"; reason:string;
};

const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:0));

export function prioritizeB2BNetwork(nodes:B2BNode[]):B2BPriority[]{
  return nodes.map(node=>{
    if(node.optedOut)return {...node,score:0,action:"BLOCK" as const,reason:"Opt-out/Compliance block"};
    const fit=clamp(node.fit),intent=clamp(node.intent),trust=clamp(node.trust),strength=clamp(node.relationshipStrength);
    const recency=node.lastActivityDays==null?0:clamp(100-node.lastActivityDays*2);
    const value=node.estimatedValueCents==null?0:clamp(Math.log10(Math.max(1,node.estimatedValueCents))*18);
    const score=Math.round(clamp(fit*.25+intent*.25+trust*.15+strength*.15+recency*.1+value*.1));
    let action:B2BPriority["action"]="NURTURE",reason="Relationship requires more evidence";
    if(node.kind==="partner"&&trust>=70&&fit>=70){action="PARTNER";reason="Strong partner fit and trust";}
    else if(node.kind==="customer"&&score>=65){action="EXPAND";reason="Existing relationship with measured expansion fit";}
    else if(score>=60){action="QUALIFY";reason="High fit/intent warrants qualification";}
    return {...node,fit,intent,trust,relationshipStrength:strength,score,action,reason};
  }).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key));
}

export type InfluencerLearningSignal={
  personaId:string; platform:string; pillar:string;
  impressions:number; clicks:number; leads:number; conversions:number; revenueCents:number;
  published:number; failed:number;
};
export type InfluencerEvolution={
  personaId:string; observations:number; score:number;
  platformWeights:Record<string,number>; pillarWeights:Record<string,number>;
  nextExperiments:Array<{dimension:"platform"|"pillar";value:string;reason:string}>;
  guardrails:string[];
};

function normalizeWeights(values:Map<string,number>):Record<string,number>{
  const entries=[...values.entries()];
  const positive=entries.map(([k,v])=>[k,Math.max(.01,v)] as const);
  const total=positive.reduce((s,[,v])=>s+v,0)||1;
  return Object.fromEntries(positive.map(([k,v])=>[k,Number((v/total).toFixed(4))]));
}

export function evolveInfluencerFromEvidence(signals:InfluencerLearningSignal[]):InfluencerEvolution[]{
  const personas=[...new Set(signals.map(s=>s.personaId))];
  return personas.map(personaId=>{
    const own=signals.filter(s=>s.personaId===personaId);
    const platform=new Map<string,number>(),pillar=new Map<string,number>();
    let observations=0,totalScore=0;
    for(const s of own){
      const impressions=Math.max(0,s.impressions),clicks=Math.max(0,s.clicks),leads=Math.max(0,s.leads),conversions=Math.max(0,s.conversions);
      observations+=impressions;
      const ctr=impressions?clicks/impressions:0, leadRate=clicks?leads/clicks:0, conversion=leads?conversions/leads:clicks?conversions/clicks:0;
      const revenuePerK=impressions?Math.max(0,s.revenueCents)/impressions*1000:0;
      const reliability=s.published+s.failed>0?s.published/(s.published+s.failed):.5;
      const evidence=Math.min(1,Math.log10(impressions+1)/3);
      const signal=(ctr*25+leadRate*25+conversion*30+Math.min(1,revenuePerK/10000)*15+reliability*5)*(0.25+0.75*evidence);
      platform.set(s.platform,(platform.get(s.platform)??0)+signal);
      pillar.set(s.pillar,(pillar.get(s.pillar)??0)+signal);
      totalScore+=signal;
    }
    const platformWeights=normalizeWeights(platform),pillarWeights=normalizeWeights(pillar);
    const bestPlatform=Object.entries(platformWeights).sort((a,b)=>b[1]-a[1])[0];
    const bestPillar=Object.entries(pillarWeights).sort((a,b)=>b[1]-a[1])[0];
    const nextExperiments:Array<{dimension:"platform"|"pillar";value:string;reason:string}>=[];
    if(bestPlatform)nextExperiments.push({dimension:"platform",value:bestPlatform[0],reason:"Highest evidence-weighted performance"});
    if(bestPillar)nextExperiments.push({dimension:"pillar",value:bestPillar[0],reason:"Highest evidence-weighted content performance"});
    return {
      personaId,observations,score:Number((totalScore/Math.max(1,own.length)).toFixed(2)),platformWeights,pillarWeights,nextExperiments,
      guardrails:[
        "Core identity, disclosure and safety boundaries are immutable.",
        "Weights learn only from measured performance; no fabricated audience facts.",
        "New variants retain exploration capacity; external publishing remains policy-gated.",
      ],
    };
  }).sort((a,b)=>b.score-a.score||a.personaId.localeCompare(b.personaId));
}

export function buildAlwaysOnInfluencerPlan(evolutions:InfluencerEvolution[], maxExperiments=12){
  const queue=evolutions.flatMap(e=>e.nextExperiments.map(x=>({personaId:e.personaId,...x,score:e.score})))
    .sort((a,b)=>b.score-a.score||a.personaId.localeCompare(b.personaId))
    .slice(0,Math.max(1,Math.min(50,maxExperiments)));
  return {mode:"24/7-learning" as const,queue,learningDimensions:["platform","pillar","hook","cta"],identityMutationAllowed:false,externalActionRequiresGate:true};
}


export type B2BEdgeSignal={stage:string;strength:number};
export function buildB2BNetworkHealth(nodes:B2BNode[],edges:B2BEdgeSignal[]){
  const active=nodes.filter(n=>!n.optedOut);
  const stale=active.filter(n=>n.lastActivityDays!=null&&n.lastActivityDays>=30).length;
  const qualified=edges.filter(e=>e.stage==="qualified").length;
  const engaged=edges.filter(e=>e.stage==="engaged").length;
  const customers=edges.filter(e=>e.stage==="customer").length;
  const partners=edges.filter(e=>e.stage==="partner").length;
  const pipeline=Math.max(1,qualified+engaged+customers);
  const avgTrust=active.length?active.reduce((s,n)=>s+clamp(n.trust),0)/active.length:0;
  const avgStrength=edges.length?edges.reduce((s,e)=>s+clamp(e.strength),0)/edges.length:0;
  const customerConversion=customers/pipeline;
  const relationshipCoverage=active.length?Math.min(1,edges.length/active.length):0;
  const healthScore=Math.round(clamp(
    avgTrust*.25+avgStrength*.2+customerConversion*100*.25+relationshipCoverage*100*.2+(1-stale/Math.max(1,active.length))*100*.1
  ));
  const nextActions:string[]=[];
  if(stale>0)nextActions.push(`${stale} aktive Beziehungen seit >=30 Tagen ohne Signal: Re-Qualifizierung vorbereiten`);
  if(relationshipCoverage<.75)nextActions.push("Netzwerkabdeckung erhöhen: qualifizierte Beziehungen zwischen passenden Nodes ergänzen");
  if(qualified>0&&customers===0)nextActions.push("Qualified→Customer ist der größte messbare B2B-Engpass");
  if(partners===0&&active.some(n=>n.kind==="partner"))nextActions.push("Partner-Kandidaten mit hoher Trust/Fit-Evidenz in eine messbare Partner-Pipeline überführen");
  if(nextActions.length===0)nextActions.push("Netzwerk stabil: neue Segmente kontrolliert explorieren");
  return {
    healthScore,activeNodes:active.length,staleNodes:stale,relationshipCoverage:Number(relationshipCoverage.toFixed(3)),
    customerConversion:Number(customerConversion.toFixed(3)),avgTrust:Number(avgTrust.toFixed(1)),avgRelationshipStrength:Number(avgStrength.toFixed(1)),
    stages:{qualified,engaged,customers,partners},nextActions,
  };
}
