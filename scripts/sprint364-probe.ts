import { createProjectSuperagentBlueprint } from "../lib/project-superagent-factory-logic";
import { planInfluencerCampaign } from "../lib/influencer-reach-logic";
import { buildVillaBlueprint, planWorkerSpawn } from "../lib/bot-villa-logic";

const blueprint = createProjectSuperagentBlueprint({
  name: "CyberSarah Growth",
  kind: "saas",
  goal: "Reichweite und Umsatz maximal skalieren",
});
console.log("Superagent:", blueprint.superagent.name, "|", blueprint.superagent.color);
console.log("Villa:", blueprint.villa.coreTeam.length, "Kern /", blueprint.villa.pool.length, "Pool /", blueprint.villa.poolCapacity, "Kapazitaet /", blueprint.villa.liveWorkerCap, "live max");

const plan = planInfluencerCampaign("KI-SaaS-Plattform fuer B2B-Start-ups", "umsatz", { days: 7 });
console.log("Kampagne: Fokus =", plan.focusPersona, "| Support =", plan.supportingPersonas.join(", "), "|", plan.slots.length, "Slots | Reichweite-Index", plan.projectedReachIndex);

const spawn = planWorkerSpawn(buildVillaBlueprint("saas"), "api-service Endpoint fuer die Kampagnen-Auswertung bauen");
console.log("Spawn:", spawn.workers.length, "Worker ->", spawn.note.slice(0, 90));
