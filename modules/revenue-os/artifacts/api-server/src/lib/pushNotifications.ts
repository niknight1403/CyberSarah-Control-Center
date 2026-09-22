/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * PUSH NOTIFICATION SERVICE (Firebase Cloud Messaging)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Versendet Push-Benachrichtigungen via Firebase Admin SDK.
 * Konfiguration (.env):
 *   FIREBASE_PROJECT_ID=cybersarah-revenue-os
 *   FIREBASE_CLIENT_EMAIL=firebase-adminsdk@cybersarah.iam.gserviceaccount.com
 *   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
 *
 * Fallback: Web-Push (VAPID) wenn Firebase nicht konfiguriert ist.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */
import { logger } from "./logger";

// ─── Typen ───────────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  badge?: number;
  sound?: string;
  topic?: string;
  token?: string | string[];
  clickAction?: string; // deep link URL
}

export interface PushResult {
  success: boolean;
  messageId?: string;
  error?: string;
  count: number;
}

// ─── Device-Token Speicher (In-Memory + DB) ──────────────────────────────────

interface DeviceToken {
  token: string;
  platform: "ios" | "android" | "web";
  topics: string[];
  userId?: string;
  createdAt: Date;
}

const deviceTokens: Map<string, DeviceToken> = new Map();
const DEVICE_TOKENS_KEY = "push_device_tokens";

function loadTokens(): void {
  try {
    const stored = process.env[DEVICE_TOKENS_KEY];
    if (stored) {
      const parsed = JSON.parse(stored) as [string, DeviceToken][];
      for (const [k, v] of parsed) deviceTokens.set(k, v);
    }
  } catch { /* Kein persistierter Token-Speicher */ }
}

loadTokens();

// ═══════════════════════════════════════════════════════════════════════════════
// FIREBASE ADMIN INIT
// ═══════════════════════════════════════════════════════════════════════════════

let firebaseMessaging: any = null;
let firebaseInitialized = false;

async function initFirebase(): Promise<boolean> {
  if (firebaseInitialized) return !!firebaseMessaging;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    logger.warn("⚠️ Firebase nicht konfiguriert — Push via Web-Push (VAPID) als Fallback");
    firebaseInitialized = true;
    return false;
  }

  try {
    const admin = await import("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, "\n"),
        }),
      });
    }
    firebaseMessaging = admin.messaging();
    firebaseInitialized = true;
    logger.info("🔥 Firebase Admin SDK initialisiert");
    return true;
  } catch (err) {
    logger.error({ err }, "Firebase Admin SDK Initialisierung fehlgeschlagen");
    firebaseInitialized = true;
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEB-PUSH (VAPID) FALLBACK — für Browser-Benachrichtigungen
// ═══════════════════════════════════════════════════════════════════════════════

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "BKdGtH7LxP8QwRnXmYp3s6v9yB2E5H8KbN1Q4W7Z0C3F6I9L";
const WEB_PUSH_ENABLED = !!process.env.VAPID_PRIVATE_KEY;

async function sendWebPush(subscription: PushSubscriptionJSON, payload: PushPayload): Promise<PushResult> {
  if (!WEB_PUSH_ENABLED) {
    return { success: false, count: 0, error: "VAPID_PRIVATE_KEY nicht konfiguriert" };
  }

  try {
    const webpush = await import("web-push");
    webpush.setVapidDetails(
      "mailto:push@cybersarah.ai",
      VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY!,
    );

    await webpush.sendNotification(
      subscription as any,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: "/icon.png",
        badge: "/badge.png",
        data: payload.data,
        image: payload.imageUrl,
        click_action: payload.clickAction,
      }),
    );

    return { success: true, count: 1, messageId: `webpush-${Date.now()}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Web-Push-Fehler";
    return { success: false, count: 0, error: msg };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUSH SENDEN — Hauptfunktion
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendPushNotification(payload: PushPayload): Promise<PushResult> {
  const hasFirebase = await initFirebase();

  if (hasFirebase && firebaseMessaging) {
    return sendViaFCM(payload);
  }

  // Fallback: Web-Push an alle gespeicherten subscriptions
  const webSubscriptions: PushSubscriptionJSON[] = [];
  for (const [, token] of deviceTokens) {
    if (token.platform === "web") {
      try {
        webSubscriptions.push(JSON.parse(token.token));
      } catch { /* ungültige subscription ignorieren */ }
    }
  }

  if (webSubscriptions.length > 0 && WEB_PUSH_ENABLED) {
    let gesendet = 0;
    for (const sub of webSubscriptions) {
      const result = await sendWebPush(sub, payload);
      if (result.success) gesendet++;
    }
    return { success: gesendet > 0, count: gesendet, messageId: `webpush-batch-${Date.now()}` };
  }

  // DEV-Modus: Nur loggen
  logger.info(
    { title: payload.title, body: payload.body, data: payload.data },
    `📱 [DEV] Push-Benachrichtigung: "${payload.title}" — ${payload.body}`
  );

  return { success: true, count: 0, messageId: `dev-${Date.now()}` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIREBASE CLOUD MESSAGING
// ═══════════════════════════════════════════════════════════════════════════════

async function sendViaFCM(payload: PushPayload): Promise<PushResult> {
  const message: any = {
    notification: {
      title: payload.title,
      body: payload.body,
      imageUrl: payload.imageUrl,
    },
    data: payload.data ?? {},
    android: {
      notification: {
        channelId: "cybersarah_default",
        priority: "high",
        sound: payload.sound ?? "default",
        ...(payload.badge ? { badge: payload.badge } : {}),
      },
    },
    apns: {
      payload: {
        aps: {
          sound: payload.sound ?? "default",
          badge: payload.badge ?? 1,
          alert: {
            title: payload.title,
            body: payload.body,
          },
        },
      },
      ...(payload.imageUrl ? { fcm_options: { image: payload.imageUrl } } : {}),
    },
    webpush: {
      notification: {
        title: payload.title,
        body: payload.body,
        icon: "/icon.png",
        ...(payload.imageUrl ? { image: payload.imageUrl } : {}),
      },
      fcm_options: {
        link: payload.clickAction ?? "/",
      },
    },
  };

  try {
    let result: any;

    if (payload.topic) {
      // An Topic senden (alle Abonnenten)
      message.topic = payload.topic;
      result = await firebaseMessaging.send(message);
    } else if (payload.token) {
      // An spezifische Device-Tokens
      const tokens = Array.isArray(payload.token) ? payload.token : [payload.token];

      if (tokens.length === 1) {
        message.token = tokens[0];
        result = await firebaseMessaging.send(message);
        return { success: true, messageId: result, count: 1 };
      }

      // Multicast an mehrere Tokens
      result = await firebaseMessaging.sendEachForMulticast({
        ...message,
        tokens,
      });
      const successCount = result.successCount ?? 0;
      return { success: successCount > 0, messageId: `multicast-${Date.now()}`, count: successCount };
    } else {
      return { success: false, count: 0, error: "Kein Ziel (topic oder token) angegeben" };
    }

    return { success: true, messageId: result, count: 1 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "FCM-Fehler";
    logger.error({ err, title: payload.title }, "🔥 FCM Push fehlgeschlagen");
    return { success: false, count: 0, error: msg };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE-TOKEN VERWALTUNG
// ═══════════════════════════════════════════════════════════════════════════════

export function registerDeviceToken(token: string, platform: "ios" | "android" | "web", topics: string[] = [], userId?: string): void {
  deviceTokens.set(token, {
    token,
    platform,
    topics,
    userId,
    createdAt: new Date(),
  });
  logger.info({ platform, topicsCount: topics.length }, "📱 Push-Device registriert");
}

export function unregisterDeviceToken(token: string): void {
  deviceTokens.delete(token);
  logger.info("📱 Push-Device entfernt");
}

export function getDeviceTokens(): DeviceToken[] {
  return Array.from(deviceTokens.values());
}

export function getDeviceCount(): number {
  return deviceTokens.size;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOPIC-VERWALTUNG
// ═══════════════════════════════════════════════════════════════════════════════

export function subscribeToTopic(token: string, topic: string): void {
  const device = deviceTokens.get(token);
  if (device && !device.topics.includes(topic)) {
    device.topics.push(topic);
  }
}

export function unsubscribeFromTopic(token: string, topic: string): void {
  const device = deviceTokens.get(token);
  if (device) {
    device.topics = device.topics.filter(t => t !== topic);
  }
}

export const TOPICS = {
  UMSATZ: "umsatz",
  AGENT_AKTIV: "agent_aktiv",
  AGENT_FEHLER: "agent_fehler",
  NEUE_CHANCE: "neue_chance",
  SYSTEM: "system",
  WARNUNG: "warnung",
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// VORDEFINIERTE BENACHRICHTIGUNGEN
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendUmsatzAlert(betrag: number, produkt: string): Promise<PushResult> {
  return sendPushNotification({
    title: "💰 Neuer Umsatz!",
    body: `${produkt} — €${betrag.toFixed(2)}`,
    data: { type: "umsatz", betrag: String(betrag), produkt },
    topic: TOPICS.UMSATZ,
    sound: "default",
    badge: 1,
  });
}

export async function sendAgentAlert(agentName: string, status: string, detail: string): Promise<PushResult> {
  const isError = status === "fehler" || status === "error";
  return sendPushNotification({
    title: isError ? `⚠️ Agent-Fehler: ${agentName}` : `✅ ${agentName} aktiv`,
    body: isError ? detail : `${agentName}: ${detail}`,
    data: { type: "agent", agent: agentName, status },
    topic: isError ? TOPICS.AGENT_FEHLER : TOPICS.AGENT_AKTIV,
    sound: isError ? "alert" : "default",
    badge: isError ? 1 : 0,
  });
}

export async function sendChanceAlert(chanceTitel: string, umsatz: string): Promise<PushResult> {
  return sendPushNotification({
    title: "🎯 Neue Umsatzchance!",
    body: `${chanceTitel} — geschätzt €${umsatz}/Monat`,
    data: { type: "chance", titel: chanceTitel, umsatz },
    topic: TOPICS.NEUE_CHANCE,
  });
}

export async function sendSystemAlert(message: string): Promise<PushResult> {
  return sendPushNotification({
    title: "🔧 System-Benachrichtigung",
    body: message,
    data: { type: "system" },
    topic: TOPICS.SYSTEM,
    sound: "alert",
  });
}

export async function sendTestPush(to: string): Promise<PushResult> {
  return sendPushNotification({
    title: "🧪 Test-Benachrichtigung",
    body: "Wenn du diese Nachricht siehst, funktionieren Push-Benachrichtigungen!",
    data: { type: "test", to },
    token: to,
    sound: "default",
  });
}
