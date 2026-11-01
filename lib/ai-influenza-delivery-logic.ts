import type {AiInfluenzaPackageId} from "./ai-influenza-team-logic";

export type AiInfluenzaDeliveryBrief={
  taskKind:string;
  quantity:number;
  channel:string;
  format:string;
  objective:string;
  requiresApproval:true;
  renderPipeline:"draft-only"|"media-pipeline"|"report";
};

export function buildAiInfluenzaDeliveryBriefs(packageId:AiInfluenzaPackageId):AiInfluenzaDeliveryBrief[]{
  if(packageId==="starter")return [
    {taskKind:"content-post",quantity:12,channel:"social",format:"post",objective:"Relevanz und qualifizierte Inbound-Nachfrage",requiresApproval:true,renderPipeline:"draft-only"},
    {taskKind:"ai-image",quantity:4,channel:"social",format:"image-brief",objective:"Visuelle Wiedererkennung und Hook-Unterstützung",requiresApproval:true,renderPipeline:"draft-only"},
    {taskKind:"content-plan",quantity:1,channel:"strategy",format:"calendar",objective:"Monatliche Content-Priorisierung",requiresApproval:true,renderPipeline:"report"},
  ];
  if(packageId==="growth")return [
    {taskKind:"short-video",quantity:12,channel:"short-video",format:"reel-short-script",objective:"Reach, Retention und qualifizierter CTA",requiresApproval:true,renderPipeline:"media-pipeline"},
    {taskKind:"content-post",quantity:20,channel:"social",format:"post",objective:"Affinity und Funnel-Unterstützung",requiresApproval:true,renderPipeline:"draft-only"},
    {taskKind:"monthly-report",quantity:1,channel:"reporting",format:"monthly-report",objective:"Messbare Leistungs- und Lernzusammenfassung",requiresApproval:true,renderPipeline:"report"},
  ];
  return [
    {taskKind:"custom-strategy",quantity:1,channel:"strategy",format:"custom-plan",objective:"Vereinbarter Business-Outcome und KPI-Plan",requiresApproval:true,renderPipeline:"report"},
    {taskKind:"content-production",quantity:1,channel:"multi-channel",format:"custom-content-batch",objective:"Individuell vereinbarter Marketing-Output",requiresApproval:true,renderPipeline:"draft-only"},
    {taskKind:"performance-report",quantity:1,channel:"reporting",format:"performance-report",objective:"Umsatz-, Funnel- und Delivery-Evidenz",requiresApproval:true,renderPipeline:"report"},
  ];
}

export function aiInfluenzaCreativePrompt(input:{
  companyName:string;packageId:AiInfluenzaPackageId;taskKind:string;quantity:number;goal?:string;
}){
  return [
    "Du arbeitest für AI Influenza Team innerhalb CyberSarah.",
    `Kunde: ${input.companyName}. Paket: ${input.packageId}. Aufgabe: ${input.taskKind}. Menge: ${input.quantity}.`,
    `Ziel: ${input.goal?.trim()||"messbarer geschäftlicher Nutzen ohne unbelegte Behauptungen"}.`,
    "Erstelle einen professionellen, konkreten Arbeitsentwurf. Keine erfundenen Kundenresultate, Testimonials oder Umsatzgarantien.",
    "Externe Veröffentlichung erfolgt erst nach Freigabe. Bei Video: liefere ein kompaktes Skript mit Hook, Szenen, Voiceover, Untertiteln und CTA.",
  ].join("\n");
}
