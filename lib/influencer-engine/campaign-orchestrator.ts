import { rankTrends, type TrendSignal } from "./trend-analyzer";
import { buildShortScriptBlueprint } from "./short-script";
import { buildVisualPrompt, type AvatarProfile } from "./visual-prompt";
import { reviewHealthCopy } from "./health-compliance";
import { rankAffiliateOffers, type AffiliateOffer } from "./affiliate-strategy";
import { buildPublishingPlan, type PublishPlatform } from "./publishing-plan";
import { buildHookExperiment } from "./experimentation";

export type CampaignBrief = {
  topic: string;
  audience: string;
  persona: AvatarProfile;
  trends?: TrendSignal[];
  affiliateOffers?: AffiliateOffer[];
  platforms: PublishPlatform[];
};

export function buildCampaignPlan(brief: CampaignBrief) {
  const topic = brief.topic.trim();
  if (topic.length < 3) throw new Error("Thema muss mindestens 3 Zeichen enthalten.");
  const trends = rankTrends(brief.trends ?? [], 5);
  const primaryPlatform = brief.platforms[0] ?? "instagram";
  const script = buildShortScriptBlueprint({ topic, audience: brief.audience, platform: primaryPlatform });
  const visualPrompt = buildVisualPrompt({ topic, format: "9:16", avatar: brief.persona });
  const compliance = reviewHealthCopy([script.hook, ...script.beats, script.cta].join(" "), (brief.affiliateOffers?.length ?? 0) > 0);
  const affiliate = rankAffiliateOffers(brief.affiliateOffers ?? []);
  const publishing = buildPublishingPlan(brief.platforms.length ? brief.platforms : ["instagram"]);
  const experiments = buildHookExperiment(topic);
  return {
    topic,
    audience: brief.audience.trim(),
    trends,
    script,
    visualPrompt,
    compliance,
    affiliate,
    publishing,
    experiments,
    readyForManualReview: compliance.ok,
  };
}
