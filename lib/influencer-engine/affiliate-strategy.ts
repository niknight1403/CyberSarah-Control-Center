export type AffiliateOffer = {
  name: string;
  category: string;
  commissionPercent: number;
  evidenceFit: number;
  audienceFit: number;
};

export type AffiliateRecommendation = AffiliateOffer & {
  score: number;
  disclosure: string;
};

const bounded = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

export function rankAffiliateOffers(offers: AffiliateOffer[]): AffiliateRecommendation[] {
  return offers
    .map((offer) => {
      const score = Math.round((bounded(offer.evidenceFit) * 0.5 + bounded(offer.audienceFit) * 0.4 + Math.min(30, Math.max(0, offer.commissionPercent)) / 30 * 10) * 10) / 10;
      return {
        ...offer,
        commissionPercent: Math.max(0, offer.commissionPercent),
        evidenceFit: bounded(offer.evidenceFit),
        audienceFit: bounded(offer.audienceFit),
        score,
        disclosure: "Werbung/Affiliate-Link: Bei einem Kauf kann eine Provision entstehen; der Preis bleibt für dich gleich.",
      };
    })
    .sort((a, b) => b.score - a.score);
}
