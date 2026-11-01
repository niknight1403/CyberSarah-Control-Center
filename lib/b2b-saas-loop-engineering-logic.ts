import type { B2BPriority } from "./b2b-influencer-network-logic";
import type { InfluencerPersonaId } from "./influencer-persona-logic";

export type B2BPersonaAssignment = {
  nodeKey:string;
  primaryPersona:InfluencerPersonaId;
  secondaryPersona:InfluencerPersonaId|null;
  score:number;
  objective:"qualify"|"nurture"|"partner"|"expand";
  reason:string;
};

export type B2BNetworkHealthInput = {
  healthScore:number;
  activeNodes:number;
  staleNodes:number;
  relationshipCoverage:number;
  customerConversion:number;
  avgTrust:number;
  avgRelationshipStrength:number;
  stages:{qualified:number;engaged:number;customers:number;partners:number};
};

export type SaaSLoopPlan = {
  focus:"coverage"|"conversion"|"retention"|"partner"|"expansion";
  title:string;
  metric:string;
  current:number;
  targetDirection:"increase"|"decrease";
  ownerPersona:InfluencerPersonaId;
  stages:string[];
  hypotheses:string[];
  evidence:string[];
  externalActionRequiresApproval:true;
};

const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:0));

function personaScores(item:B2BPriority):Record<InfluencerPersonaId,number>{
  const base:Record<InfluencerPersonaId,number>={
    nova:20,mira:20,juno:35,lina:15,kaya:15,zara:20,
  };
  if(item.kind==="company"||item.kind==="lead"){base.juno+=25;base.nova+=12;base.zara+=8;}
  if(item.kind==="customer"){base.juno+=22;base.kaya+=12;base.lina+=8;}
  if(item.kind==="partner"){base.juno+=20;base.zara+=18;base.nova+=12;}
  if(item.kind==="creator"){base.zara+=32;base.nova+=8;base.mira+=8;}
  if(item.action==="QUALIFY"){base.juno+=18;base.nova+=8;}
  if(item.action==="NURTURE"){base.mira+=18;base.zara+=8;}
  if(item.action==="PARTNER"){base.juno+=16;base.zara+=16;}
  if(item.action==="EXPAND"){base.juno+=14;base.kaya+=12;base.lina+=8;}
  const commercial=(clamp(item.fit)+clamp(item.intent)+clamp(item.trust))/30;
  base.juno+=commercial;
  base.nova+=clamp(item.intent)/20;
  base.kaya+=clamp(item.estimatedValueCents?Math.log10(Math.max(1,item.estimatedValueCents))*18:0)/20;
  return base;
}

export function assignPersonasToB2B(priorities:B2BPriority[],limit=50):B2BPersonaAssignment[]{
  return priorities
    .filter(item=>item.action!=="BLOCK")
    .slice(0,Math.max(1,Math.min(200,limit)))
    .map(item=>{
      const ranked=Object.entries(personaScores(item))
        .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])) as Array<[InfluencerPersonaId,number]>;
      const primary=ranked[0]!;
      const secondary=ranked[1]!;
      const objective:B2BPersonaAssignment["objective"]=
        item.action==="PARTNER"?"partner":item.action==="EXPAND"?"expand":
        item.action==="QUALIFY"?"qualify":"nurture";
      return {
        nodeKey:item.key,
        primaryPersona:primary[0],
        secondaryPersona:secondary[1]>=primary[1]*0.8?secondary[0]:null,
        score:item.score,
        objective,
        reason:`${item.reason}; Persona passend zu Beziehungstyp, Intent, Trust und Ziel gewählt`,
      };
    });
}

export function buildB2BExpansionQueue(priorities:B2BPriority[],assignments:B2BPersonaAssignment[],limit=20){
  const assignmentByNode=new Map(assignments.map(a=>[a.nodeKey,a]));
  return priorities
    .filter(item=>item.action!=="BLOCK")
    .map(item=>({
      nodeKey:item.key,
      priorityScore:item.score,
      action:item.action,
      persona:assignmentByNode.get(item.key)?.primaryPersona??"juno",
      objective:assignmentByNode.get(item.key)?.objective??"nurture",
      estimatedValueCents:item.estimatedValueCents??null,
      nextStep:item.action==="PARTNER"
        ?"Partner-Hypothese und gemeinsamen Nutzen als Entwurf vorbereiten"
        :item.action==="EXPAND"
          ?"Expansion-/Cross-Sell-Hypothese aus Nutzungs- und Wertsignalen vorbereiten"
          :item.action==="QUALIFY"
            ?"Qualifizierungsfragen und Value-Proposition als Entwurf vorbereiten"
            :"Nurture-Entwurf mit relevantem, nicht aufdringlichem Nutzen vorbereiten",
      recommendedChannel:item.action==="PARTNER"?"linkedin"
        :item.action==="EXPAND"?"email"
        :item.action==="QUALIFY"?(item.kind==="company"?"linkedin":"email")
        :"content-nurture",
      ctaMode:item.action==="PARTNER"?"pilot"
        :item.action==="EXPAND"?"expansion-review"
        :item.action==="QUALIFY"?"discovery"
        :"value-content",
      externalActionRequiresApproval:true as const,
    }))
    .sort((a,b)=>b.priorityScore-a.priorityScore||a.nodeKey.localeCompare(b.nodeKey))
    .slice(0,Math.max(1,Math.min(100,limit)));
}

export function buildSaaSLoopEngineeringPlan(
  health:B2BNetworkHealthInput,
  priorities:B2BPriority[],
  assignments:B2BPersonaAssignment[],
):SaaSLoopPlan{
  const active=priorities.filter(p=>p.action!=="BLOCK");
  const avgIntent=active.length?active.reduce((s,p)=>s+clamp(p.intent),0)/active.length:0;
  const avgFit=active.length?active.reduce((s,p)=>s+clamp(p.fit),0)/active.length:0;
  let focus:SaaSLoopPlan["focus"]="expansion";
  if(health.relationshipCoverage<0.75)focus="coverage";
  else if(health.staleNodes>0 && health.staleNodes/Math.max(1,health.activeNodes)>=0.2)focus="retention";
  else if(health.stages.qualified>0 && health.customerConversion<0.25)focus="conversion";
  else if(health.stages.partners===0 && active.some(p=>p.kind==="partner"))focus="partner";

  const owner:InfluencerPersonaId=focus==="retention"?"mira":focus==="coverage"?"nova":focus==="partner"?"zara":"juno";
  const config={
    coverage:{
      title:"B2B Relationship Coverage Loop",metric:"relationshipCoverage",current:health.relationshipCoverage,
      targetDirection:"increase" as const,
      hypotheses:["Mehr qualifizierte, belegte Beziehungen reduzieren blinde Flecken im B2B-Netzwerk.","Juno/Nova können passende Value-Propositions vorqualifizieren, bevor externe Aktionen freigegeben werden."],
    },
    conversion:{
      title:"Qualified-to-Customer SaaS Loop",metric:"customerConversion",current:health.customerConversion,
      targetDirection:"increase" as const,
      hypotheses:["Der größte Hebel liegt zwischen qualifizierter Beziehung und Kunde.","Persona-spezifische Nutzenargumente und kleinere Experimente können die Conversion messbar verbessern."],
    },
    retention:{
      title:"Relationship Retention Loop",metric:"staleNodes",current:health.staleNodes,
      targetDirection:"decrease" as const,
      hypotheses:["Ein hoher Anteil inaktiver Beziehungen senkt Pipeline-Qualität und Lernsignal.","Nurture-Entwürfe sollten nach Fit, Trust und letzter Aktivität priorisiert werden."],
    },
    partner:{
      title:"Partner Network Loop",metric:"partners",current:health.stages.partners,
      targetDirection:"increase" as const,
      hypotheses:["Vertrauensstarke Partner können Reichweite und Distribution effizienter erweitern als reine Lead-Menge.","Partner-Vorschläge werden nur aus vorhandener Fit-/Trust-Evidenz erzeugt."],
    },
    expansion:{
      title:"SaaS Expansion Loop",metric:"expansionCandidates",current:active.filter(p=>p.action==="EXPAND").length,
      targetDirection:"increase" as const,
      hypotheses:["Bestehende Kunden mit hohem Fit, Intent und Wert sind der sicherste Expansion-Pool.","Cross-Sell- und Retention-Hypothesen sollten zuerst an messbarer Kundenevidenz getestet werden."],
    },
  }[focus];

  return {
    focus,
    title:config.title,
    metric:config.metric,
    current:config.current,
    targetDirection:config.targetDirection,
    ownerPersona:owner,
    stages:[
      "Observe: echte B2B-, Funnel- und Revenue-Signale lesen",
      "Diagnose: engsten messbaren SaaS-Engpass bestimmen",
      "Design: Persona + Hypothese + nächste reversible Aktion wählen",
      "Draft: B2B-/SaaS-Entwurf ohne externen Versand erzeugen",
      "Approve/Execute: externe Aktion nur über bestehende Freigabe- und Policy-Gates",
      "Measure: Conversion, Relationship Strength, Revenue und Retention erfassen",
      "Learn: Persona- und Loop-Gewichte aus gemessener Evidenz aktualisieren",
    ],
    hypotheses:config.hypotheses,
    evidence:[
      `healthScore=${health.healthScore}`,
      `activeNodes=${health.activeNodes}`,
      `relationshipCoverage=${health.relationshipCoverage}`,
      `customerConversion=${health.customerConversion}`,
      `avgIntent=${Number(avgIntent.toFixed(1))}`,
      `avgFit=${Number(avgFit.toFixed(1))}`,
      `personaAssignments=${assignments.length}`,
    ],
    externalActionRequiresApproval:true,
  };
}
