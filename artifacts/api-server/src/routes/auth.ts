/**
 * AUTH-ROUTES (Sprint 65)
 *   POST /auth/login  — E-Mail + Passwort → Session-Token (24h, HMAC-signiert)
 *   GET  /auth/me     — Aktueller Nutzer (Token-Bearer) mit Legacy-Fallback
 *   GET  /auth/rechte  — Effektive Rechte-Matrix des authentifizierten Nutzers
 */
import { Router, type Request } from "express";
import { login, verifiziereToken } from "../lib/adminAccount";
import { hatRecht, rechteFuerTier, ALLE_RECHTE, type Recht } from "../lib/berechtigungen";
import type { PlanTier } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

function leseToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = req.headers.cookie;
  if (cookie) {
    const treffer = /(?:^|;\s*)cybersarah_token=([^;]+)/.exec(cookie);
    if (treffer) return decodeURIComponent(treffer[1]);
  }
  return null;
}

// ── POST /auth/login ────────────────────────────────────────────────────────
router.post("/auth/login", async (req, res) => {
  const { email, passwort } = req.body ?? {};
  if (!email || !passwort) {
    return res.status(400).json({ fehler: "E-Mail und Passwort erforderlich" });
  }
  try {
    const ergebnis = await login(String(email), String(passwort));
    if (!ergebnis) {
      logger.warn({ email: String(email).slice(0, 3) + "***" }, "Login fehlgeschlagen (falsche Credentials)");
      return res.status(401).json({ fehler: "Ungültige E-Mail oder Passwort" });
    }
    logger.info({ userId: ergebnis.nutzer.id, rolle: ergebnis.nutzer.rolle }, "✅ Login erfolgreich");
    return res
      .cookie("cybersarah_token", ergebnis.token, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      })
      .json({
        token: ergebnis.token,
        nutzer: ergebnis.nutzer,
      });
  } catch (err) {
    logger.error({ err }, "Login-Fehler");
    return res.status(500).json({ fehler: "Server-Fehler beim Login" });
  }
});

// ── GET /auth/me ────────────────────────────────────────────────────────────
router.get("/auth/me", (req, res) => {
  const token = leseToken(req);
  const session = token ? verifiziereToken(token) : null;
  if (!session) {
    // Legacy-Fallback für bestehende Frontends ohne Login
    return res.json({
      id: "owner-1",
      email: "admin@cybersarah.ai",
      name: "CyberSarah Admin",
      role: "admin",
    });
  }
  return res.json({
    id: session.userId,
    email: session.email,
    name: "CyberSarah Nutzer",
    role: "admin",
  });
});

// ── GET /auth/rechte — effektive Rechte des authentifizierten Nutzers ──────
router.get("/auth/rechte", (req, res) => {
  const token = leseToken(req);
  const session = token ? verifiziereToken(token) : null;
  if (!session) {
    return res.status(401).json({ fehler: "Nicht authentifiziert" });
  }

  // Administrator: alle Rechte
  if (session.email.toLowerCase() === (process.env.ADMIN_EMAIL ?? "niko.oeben@gmail.com").toLowerCase()) {
    return res.json({
      rolle: "admin",
      planTier: null,
      administrator: true,
      rechte: ALLE_RECHTE,
      alleRechte: true,
    });
  }

  // Regulärer Nutzer: Rechte aus Tier ableiten
  const tier = (req.query.tier as PlanTier) ?? "lite";
  return res.json({
    rolle: "nutzer",
    planTier: tier,
    administrator: false,
    rechte: rechteFuerTier(tier),
    alleRechte: false,
  });
});

// ── GET /auth/feature-check?recht=api_zugang ───────────────────────────────
router.get("/auth/feature-check", (req, res) => {
  const recht = String(req.query.recht ?? "") as Recht;
  const token = leseToken(req);
  const session = token ? verifiziereToken(token) : null;
  if (!session) {
    return res.status(401).json({ fehler: "Nicht authentifiziert" });
  }
  const administrator = session.email.toLowerCase() === (process.env.ADMIN_EMAIL ?? "niko.oeben@gmail.com").toLowerCase();
  return res.json({
    recht,
    erlaubt: administrator || hatRecht({ berechtigungen: JSON.stringify(["*"]) }, recht),
    administrator,
  });
});

export default router;
