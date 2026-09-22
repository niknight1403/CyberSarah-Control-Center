/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PUSH NOTIFICATION API (Sprint 3.3)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * REST-API für Push-Benachrichtigungen:
 *  - Device-Token registrieren/entfernen
 *  - Topics abonnieren/kündigen
 *  - Push senden (Test, an Topic, an Token)
 *  - Status abfragen (aktive Devices, Topics)
 *  - Web-Push-Subscription speichern
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { Router } from "express";
import { logger } from "../lib/logger";
import {
  sendPushNotification, sendTestPush,
  registerDeviceToken, unregisterDeviceToken,
  subscribeToTopic, unsubscribeFromTopic,
  getDeviceTokens, getDeviceCount,
  TOPICS, sendUmsatzAlert, sendAgentAlert, sendChanceAlert, sendSystemAlert,
} from "../lib/pushNotifications";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/push/status — Push-Konfiguration + Device-Statistiken
// ═══════════════════════════════════════════════════════════════════════════════

router.get("/push/status", async (_req, res) => {
  const devices = getDeviceTokens();
  const firebaseKonfiguriert = !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );

  res.json({
    konfiguriert: firebaseKonfiguriert || !!process.env.VAPID_PRIVATE_KEY,
    firebase: firebaseKonfiguriert,
    webpush: !!process.env.VAPID_PRIVATE_KEY,
    aktiveDevices: devices.length,
    devices: devices.map(d => ({
      platform: d.platform,
      topics: d.topics,
      createdAt: d.createdAt,
    })),
    topics: Object.values(TOPICS),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/push/register — Device-Token registrieren
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/push/register", async (req, res) => {
  try {
    const body = req.body as {
      token: string;
      platform: "ios" | "android" | "web";
      topics?: string[];
    };

    if (!body.token || !body.platform) {
      res.status(400).json({ error: "token und platform (ios|android|web) erforderlich" });
      return;
    }

    registerDeviceToken(body.token, body.platform, body.topics);
    res.json({ success: true, message: "Device registriert" });
  } catch (err) {
    req.log.error({ err }, "Device-Registrierung fehlgeschlagen");
    res.status(500).json({ error: "Registrierung fehlgeschlagen" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/push/unregister — Device-Token entfernen
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/push/unregister", async (req, res) => {
  try {
    const { token } = req.body as { token: string };
    if (!token) { res.status(400).json({ error: "token erforderlich" }); return; }

    unregisterDeviceToken(token);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Entfernen" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/push/subscribe — Topic abonnieren
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/push/subscribe", async (req, res) => {
  const { token, topic } = req.body as { token: string; topic: string };
  if (!token || !topic) { res.status(400).json({ error: "token und topic erforderlich" }); return; }

  subscribeToTopic(token, topic);
  res.json({ success: true, topic });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/push/unsubscribe — Topic abbestellen
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/push/unsubscribe", async (req, res) => {
  const { token, topic } = req.body as { token: string; topic: string };
  if (!token || !topic) { res.status(400).json({ error: "token und topic erforderlich" }); return; }

  unsubscribeFromTopic(token, topic);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/push/senden — Push-Benachrichtigung senden
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/push/senden", async (req, res) => {
  try {
    const body = req.body as {
      title: string;
      body: string;
      topic?: string;
      token?: string | string[];
      data?: Record<string, string>;
      imageUrl?: string;
      clickAction?: string;
    };

    if (!body.title || !body.body) {
      res.status(400).json({ error: "title und body erforderlich" });
      return;
    }

    const result = await sendPushNotification({
      title: body.title,
      body: body.body,
      topic: body.topic,
      token: body.token,
      data: body.data,
      imageUrl: body.imageUrl,
      clickAction: body.clickAction,
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Push senden fehlgeschlagen");
    res.status(500).json({ error: "Push fehlgeschlagen" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/push/umsatz — Umsatz-Benachrichtigung (von Agenten verwendet)
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/push/umsatz", async (req, res) => {
  const { betrag, produkt } = req.body as { betrag: number; produkt: string };
  if (!betrag || !produkt) { res.status(400).json({ error: "betrag und produkt erforderlich" }); return; }

  const result = await sendUmsatzAlert(betrag, produkt);
  res.json(result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/push/agent — Agent-Status-Benachrichtigung
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/push/agent", async (req, res) => {
  const { agentName, status, detail } = req.body as { agentName: string; status: string; detail: string };
  if (!agentName || !status) { res.status(400).json({ error: "agentName und status erforderlich" }); return; }

  const result = await sendAgentAlert(agentName, status, detail ?? "");
  res.json(result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/push/test — Test-Push senden (für Einrichtung)
// ═══════════════════════════════════════════════════════════════════════════════

router.post("/push/test", async (req, res) => {
  const { token } = req.body as { token?: string };

  const result = token
    ? await sendTestPush(token)
    : await sendPushNotification({
        title: "🧪 Test-Benachrichtigung",
        body: "Push-Benachrichtigungen funktionieren!",
        data: { type: "test" },
      });

  res.json(result);
});

export default router;
