import { Router } from "express";
import { influencerAgent } from "../agents/influencerCoreAgent";

const r = Router();

r.get("/api/influencer/state", (_req, res) => res.json(influencerAgent.getState()));
r.post("/api/influencer/persona", async (req, res) => res.json(await influencerAgent.updatePersona(req.body)));
r.post("/api/influencer/trends", async (_req, res) => res.json(await influencerAgent.scanTrends()));
r.post("/api/influencer/generate", async (req, res) => {
  const { thema, plattformen } = req.body;
  if (!thema || !plattformen?.length) return res.status(400).json({ error: "thema + plattformen erforderlich" });
  res.json(await influencerAgent.generiereUndPlane(thema, plattformen));
});
r.post("/api/influencer/revenue", (req, res) => res.json(influencerAgent.addRevenueAction(req.body)));
r.patch("/api/influencer/revenue/:id/ctr", (req, res) => {
  influencerAgent.updateCTR(req.params.id, Number(req.body.ctr));
  res.json({ ok: true });
});

export default r;
