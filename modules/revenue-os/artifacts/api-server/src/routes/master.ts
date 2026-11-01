import { Router } from "express";
import { fuehreDeepOptimierungDurch } from "../agents/orchestrator";

const router = Router();

// POST /master/optimize — Deep-Optimization-Pipeline (One-Click, synchron)
// True-ROI-Neubewertung aller Chancen + Expansion-Autopilot + sofortige Pricing-Jobs.
router.post("/master/optimize", async (req, res) => {
  const ergebnis = await fuehreDeepOptimierungDurch();
  const md = (ergebnis.metadaten ?? {}) as {
    dauerMs?: number;
    quellenAnalysiert?: number;
    aktiviert?: number;
    pausiert?: number;
    autoStreams?: number;
    jobIds?: string[];
  };

  req.log.info(
    { aktiviert: md.aktiviert, pausiert: md.pausiert, autoStreams: md.autoStreams },
    "Deep-Optimierung via API abgeschlossen",
  );

  res.json({
    success: ergebnis.success,
    message: ergebnis.message,
    dauerMs: md.dauerMs ?? 0,
    quellenAnalysiert: md.quellenAnalysiert ?? 0,
    aktiviert: md.aktiviert ?? 0,
    pausiert: md.pausiert ?? 0,
    autoStreams: md.autoStreams ?? 0,
    jobIds: md.jobIds ?? [],
  });
});

export default router;
