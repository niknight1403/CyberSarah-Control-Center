export type RevenueIncident={
  code:string;
  severity:"critical"|"high"|"medium";
  domain:"payments"|"database"|"provider"|"funnel"|"growth";
  detail:string;
  autoRepairable:boolean;
  owner:"core-revenue-supervisor"|"growth-swarm"|"sales-conversion-unit";
  safeRepair:string;
};

export function classifyRevenueIncidents(blockers:string[]):RevenueIncident[]{
  return blockers.map(detail=>{
    const lower=detail.toLowerCase();
    if(lower.includes("datenbank")){
      return {code:"REV_DB_UNAVAILABLE",severity:"critical" as const,domain:"database" as const,detail,autoRepairable:false,owner:"core-revenue-supervisor" as const,safeRepair:"Geschützten Revenue-Bridge-Pfad prüfen; keine Schreiboperation ohne bestätigte DB-Verbindung"};
    }
    if(lower.includes("stripe-webhook")){
      return {code:"REV_STRIPE_WEBHOOK",severity:"critical" as const,domain:"payments" as const,detail,autoRepairable:true,owner:"core-revenue-supervisor" as const,safeRepair:"Webhook-Konfiguration und letzte Signaturfehler prüfen; nur reversible Health-/Retry-Aktionen ausführen"};
    }
    if(lower.includes("digistore24")){
      return {code:"REV_D24_IPN",severity:"high" as const,domain:"payments" as const,detail,autoRepairable:true,owner:"core-revenue-supervisor" as const,safeRepair:"IPN-Konfiguration, Signaturpfad und Datenbank-Health prüfen; keine Events synthetisch erzeugen"};
    }
    if(lower.includes("llm-provider")||lower.includes("provider-circuits")){
      return {code:"REV_PROVIDER_CAPACITY",severity:"high" as const,domain:"provider" as const,detail,autoRepairable:true,owner:"core-revenue-supervisor" as const,safeRepair:"Revenue-kritische Aufgaben priorisieren, Fallback-/Local-Route nutzen und nicht-kritische Generierung drosseln"};
    }
    if(lower.includes("funnel-engpass")||lower.includes("checkout")){
      return {code:"REV_FUNNEL_FRICTION",severity:"high" as const,domain:"funnel" as const,detail,autoRepairable:true,owner:"sales-conversion-unit" as const,safeRepair:"Reversible CRO-Hypothese als Experiment/Draft erzeugen; keine Preisänderung ohne Freigabe"};
    }
    if(lower.includes("cross-sell")){
      return {code:"REV_CROSS_SELL",severity:"medium" as const,domain:"growth" as const,detail,autoRepairable:true,owner:"growth-swarm" as const,safeRepair:"Cross-Sell-Hypothese aus gemessenen Regeln priorisieren und als Draft testen"};
    }
    return {code:"REV_GENERAL",severity:"medium" as const,domain:"growth" as const,detail,autoRepairable:false,owner:"core-revenue-supervisor" as const,safeRepair:"Diagnose vertiefen; keine irreversible Aktion ohne eindeutige Evidenz"};
  }).sort((a,b)=>{
    const rank={critical:3,high:2,medium:1};
    return rank[b.severity]-rank[a.severity]||a.code.localeCompare(b.code);
  });
}


export type RevenueRepairStep={
  incidentCode:string;
  mode:"auto"|"approval-required";
  action:"health-recheck"|"defer-noncritical-llm"|"generate-cro-draft"|"generate-cross-sell-draft"|"inspect-database"|"manual-diagnosis";
  description:string;
};

export function buildRevenueRepairPlan(incidents:RevenueIncident[]):RevenueRepairStep[]{
  return incidents.slice(0,10).map(incident=>{
    if(incident.code==="REV_PROVIDER_CAPACITY"){
      return {incidentCode:incident.code,mode:"auto" as const,action:"defer-noncritical-llm" as const,description:"Nicht-kritische LLM-Generierung zurückstellen; Revenue-kritische Route/Fallback priorisieren"};
    }
    if(incident.code==="REV_STRIPE_WEBHOOK"||incident.code==="REV_D24_IPN"){
      return {incidentCode:incident.code,mode:"auto" as const,action:"health-recheck" as const,description:"Konfiguration und Runtime-Health erneut prüfen; keine Secrets automatisch ersetzen"};
    }
    if(incident.code==="REV_FUNNEL_FRICTION"){
      return {incidentCode:incident.code,mode:"auto" as const,action:"generate-cro-draft" as const,description:"Reversible CRO-Hypothese in bestehender Revenue-Draft-Queue priorisieren"};
    }
    if(incident.code==="REV_CROSS_SELL"){
      return {incidentCode:incident.code,mode:"auto" as const,action:"generate-cross-sell-draft" as const,description:"Cross-Sell-Experiment aus gemessener Regelperformance als Draft priorisieren"};
    }
    if(incident.code==="REV_DB_UNAVAILABLE"){
      return {incidentCode:incident.code,mode:"approval-required" as const,action:"inspect-database" as const,description:"Geschützten Bridge-/DB-Zugriff diagnostizieren; keine Infrastrukturmutation ohne bestätigten Zielzustand"};
    }
    return {incidentCode:incident.code,mode:"approval-required" as const,action:"manual-diagnosis" as const,description:"Unklassifizierten Revenue-Blocker vertieft diagnostizieren"};
  });
}
