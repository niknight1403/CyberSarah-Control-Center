import { planInfluencerCampaign } from "../lib/influencer-reach-logic";
import { campaignToPlannedJobs, resolvePublishingMode } from "../lib/publishing-queue-logic";

const plan = planInfluencerCampaign("CyberSarah Control Center V4 — KI-Control-Center fuer autonome Projekte", "umsatz", { days: 3 });
const jobs = campaignToPlannedJobs(plan);
console.log("Kampagne:", plan.slots.length, "Slots | Fokus:", plan.focusPersona, "| Kanal:", plan.platformMix.join(", "));
console.log("Queue-Jobs:", jobs.length, "| Erster Slot:", jobs[0].scheduledFor.toISOString(), "| Dedupe:", jobs[0].dedupeKey);
for (const platform of ["instagram", "tiktok", "linkedin", "x", "threads"]) {
  const mode = resolvePublishingMode(platform, {});
  console.log(`  ${platform.padEnd(10)} -> ${mode.mode.padEnd(7)} | ${mode.reason.slice(0, 80)}`);
}
