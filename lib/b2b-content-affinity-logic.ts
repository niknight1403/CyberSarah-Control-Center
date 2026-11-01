import type {InfluencerPersonaId} from "./influencer-persona-logic";

export type B2BBuyerSegment="founder"|"agency-owner"|"automation-lead";
export type B2BAffinityBrief={
  segment:B2BBuyerSegment;
  label:string;
  pains:string[];
  desiredOutcomes:string[];
  hookRules:string[];
  cta:string;
};

const BRIEFS:Record<B2BBuyerSegment,B2BAffinityBrief>={
  founder:{
    segment:"founder",
    label:"Founders / SaaS-Entscheider",
    pains:["zu viel operative Handarbeit","langsames Wachstum trotz Tool-Stack","unklare Automations-ROI"],
    desiredOutcomes:["mehr Output pro Teamstunde","messbare Funnel-Verbesserung","skalierbare Prozesse ohne unnötige Infrastrukturkosten"],
    hookRules:["konkreten Zeit-/Prozessverlust benennen","messbaren Mechanismus statt Hype erklären","keine garantierten Umsatzversprechen"],
    cta:"Einen konkreten Engpass identifizieren und als messbaren Automations-Test prüfen.",
  },
  "agency-owner":{
    segment:"agency-owner",
    label:"Agency Owners",
    pains:["Delivery skaliert nicht mit Neukunden","wiederkehrende manuelle Kundenarbeit","Marge sinkt durch Tool- und Personalkosten"],
    desiredOutcomes:["standardisierte Delivery","höhere Marge pro Account","mehr Kapazität ohne proportional mehr Headcount"],
    hookRules:["Delivery-Engpass direkt ansprechen","Vorher/Nachher nur mit belegbarer Evidenz formulieren","keine künstliche Verknappung"],
    cta:"Den teuersten wiederkehrenden Delivery-Schritt auswählen und einen Automations-Blueprint testen.",
  },
  "automation-lead":{
    segment:"automation-lead",
    label:"Automation Leads / Operations",
    pains:["fragmentierte Integrationen","instabile Workflows und Provider-Ausfälle","fehlende Ende-zu-Ende-Telemetrie"],
    desiredOutcomes:["robuste Failover-Ketten","weniger manuelle Incident-Arbeit","sichtbare Kosten-/Durchsatzmetriken"],
    hookRules:["technischen Engpass präzise benennen","Reliability und Economics zusammenführen","keine erfundene Uptime oder Performancewerte"],
    cta:"Eine kritische Route auswählen und mit Health-, Fallback- und ROI-Metrik instrumentieren.",
  },
};

export function selectB2BAffinityBrief(personaId:InfluencerPersonaId,slotOffset=0):B2BAffinityBrief|null{
  if(personaId==="juno")return slotOffset%2===0?BRIEFS.founder:BRIEFS["agency-owner"];
  if(personaId==="nova")return slotOffset%2===0?BRIEFS["automation-lead"]:BRIEFS.founder;
  if(personaId==="zara")return slotOffset%2===0?BRIEFS["agency-owner"]:BRIEFS.founder;
  return null;
}

export function formatB2BAffinityPrompt(brief:B2BAffinityBrief){
  return [
    `B2B-Zielgruppe: ${brief.label}.`,
    `Reale Pain Points, an die der Content anknüpfen darf: ${brief.pains.join("; ")}.`,
    `Gewünschte Resultate: ${brief.desiredOutcomes.join("; ")}.`,
    `Hook-Regeln: ${brief.hookRules.join("; ")}.`,
    `CTA: ${brief.cta}`,
    "Psychologische Klarheit bedeutet Relevanz, konkrete Kosten des Status quo und eine einfache nächste Handlung — niemals Täuschung, Angst-Druck oder erfundene Social Proofs.",
  ].join("\n");
}
