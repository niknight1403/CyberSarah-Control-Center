// artifacts/api-server/src/routes/digistore.ts
import { Router } from "express";
import { holeDigistoreProdukte } from "../lib/digistoreClient";

const router = Router();

// ─── Produkte abrufen (GET /api/digistore/produkte) ──────────────────────────
router.get("/digistore/produkte", async (_req, res) => {
  const produkte = await holeDigistoreProdukte();
  res.json({ produkte });
});

// ─── Status (GET /api/digistore/status) ──────────────────────────────────────
router.get("/digistore/status", (_req, res) => {
  res.json({
    aktiv: !!process.env["DIGISTORE24_API_KEY"],
    affiliateId: process.env["DIGISTORE24_AFFILIATE_ID"] ?? null,
    ipnSecretKonfiguriert: !!process.env["DIGISTORE24_IPN_SECRET"],
  });
});

export default router;
