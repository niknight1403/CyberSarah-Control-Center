/**
 * toolConnectorManager — Autonomer Werkzeug-Anbindungs-Changer
 *
 * Überwacht alle externen Werkzeug-Anbindungen (Social Platforms, Zahlungen,
 * E-Mail-Marketing), prüft autonom deren Erreichbarkeit, deaktiviert tote
 * Anbindungen und reaktiviert wiederhergestellte — ohne manuelles Eingreifen.
 */
import { logger } from "./logger";

export interface ToolConnectorDef {
  id: string;
  name: string;
  kategorie: "social" | "payments" | "email" | "sonstiges";
  envKeys: string[];
  gesundheit?: () => Promise<boolean>;
  url?: string;
  kostenpflichtig: boolean;
}

export interface ConnectorZustand {
  id: string;
  name: string;
  kategorie: ToolConnectorDef["kategorie"];
  konfiguriert: boolean;
  aktiv: boolean;
  letztePruefung: string | null;
  fehlerHintereinander: number;
  notiz: string;
}

const CONNECTORS: ToolConnectorDef[] = [
  // ── Social (Reichweite) ──────────────────────────────────────────────────
  { id: "tiktok", name: "TikTok Content Posting", kategorie: "social", envKeys: ["TIKTOK_ACCESS_TOKEN"], url: "https://open.tiktokapis.com/v2/research/user/info/", kostenpflichtig: false },
  { id: "youtube", name: "YouTube Data API v3", kategorie: "social", envKeys: ["YOUTUBE_API_KEY"], url: "https://www.googleapis.com/youtube/v3", kostenpflichtig: false },
  { id: "instagram", name: "Instagram Graph API", kategorie: "social", envKeys: ["INSTAGRAM_ACCESS_TOKEN", "META_ACCESS_TOKEN"], url: "https://graph.facebook.com/v19.0", kostenpflichtig: false },
  { id: "x", name: "X (Twitter) API", kategorie: "social", envKeys: ["X_ACCESS_TOKEN", "TWITTER_BEARER_TOKEN"], url: "https://api.twitter.com/2", kostenpflichtig: false },
  { id: "threads", name: "Threads API", kategorie: "social", envKeys: ["THREADS_ACCESS_TOKEN"], url: "https://graph.threads.net/v1.0", kostenpflichtig: false },
  { id: "bluesky", name: "Bluesky ATProto (kostenlos)", kategorie: "social", envKeys: ["BLUESKY_HANDLE"], url: "https://bsky.social", kostenpflichtig: false },
  { id: "mastodon", name: "Mastodon API", kategorie: "social", envKeys: ["MASTODON_ACCESS_TOKEN"], url: "https://mastodon.social/api/v1", kostenpflichtig: false },
  { id: "telegram", name: "Telegram Bot API (kostenlos)", kategorie: "social", envKeys: ["TELEGRAM_BOT_TOKEN"], url: "https://api.telegram.org", kostenpflichtig: false },
  { id: "reddit", name: "Reddit API (kostenlos)", kategorie: "social", envKeys: ["REDDIT_CLIENT_ID"], url: "https://www.reddit.com", kostenpflichtig: false },
  { id: "pinterest", name: "Pinterest API", kategorie: "social", envKeys: ["PINTEREST_ACCESS_TOKEN"], url: "https://api.pinterest.com/v5", kostenpflichtig: false },
  // ── Payments (Umsatz) ────────────────────────────────────────────────────
  { id: "stripe", name: "Stripe Payments", kategorie: "payments", envKeys: ["STRIPE_SECRET_KEY"], kostenpflichtig: false },
  { id: "digistore24", name: "Digistore24", kategorie: "payments", envKeys: ["DIGISTORE24_API_KEY"], url: "https://www.digistore24.com", kostenpflichtig: false },
  { id: "paypal", name: "PayPal Commerce", kategorie: "payments", envKeys: ["PAYPAL_CLIENT_ID"], url: "https://api-m.paypal.com", kostenpflichtig: false },
  { id: "gumroad", name: "Gumroad (kostenloser Marktplatz)", kategorie: "payments", envKeys: ["GUMROAD_ACCESS_TOKEN"], url: "https://api.gumroad.com/v2", kostenpflichtig: false },
  { id: "lemonsqueezy", name: "Lemon Squeezy (Merchant of Record)", kategorie: "payments", envKeys: ["LEMONSQUEEZY_API_KEY"], url: "https://api.lemonsqueezy.com/v1", kostenpflichtig: false },
  { id: "payhip", name: "Payhip (kostenlos)", kategorie: "payments", envKeys: ["PAYHIP_API_KEY"], url: "https://payhip.com/api/v1", kostenpflichtig: false },
  // ── E-Mail-Marketing ─────────────────────────────────────────────────────
  { id: "beehiiv", name: "Beehiiv Newsletter", kategorie: "email", envKeys: ["BEEHIIV_API_KEY"], url: "https://api.beehiiv.com/v2", kostenpflichtig: false },
  { id: "mailchimp", name: "Mailchimp", kategorie: "email", envKeys: ["MAILCHIMP_API_KEY"], url: "https://us1.api.mailchimp.com/3.0", kostenpflichtig: false },
  { id: "resend", name: "Resend E-Mail", kategorie: "email", envKeys: ["RESEND_API_KEY"], url: "https://api.resend.com", kostenpflichtig: false },
  { id: "mailgun", name: "Mailgun", kategorie: "email", envKeys: ["MAILGUN_API_KEY"], url: "https://api.mailgun.net", kostenpflichtig: false },
  { id: "brevo", name: "Brevo (Sendinblue)", kategorie: "email", envKeys: ["BREVO_API_KEY"], url: "https://api.brevo.com/v3", kostenpflichtig: false },
];

const zustaende = new Map<string, ConnectorZustand>();

function holeZustand(def: ToolConnectorDef): ConnectorZustand {
  let z = zustaende.get(def.id);
  if (!z) {
    z = {
      id: def.id,
      name: def.name,
      kategorie: def.kategorie,
      konfiguriert: def.envKeys.some((k) => (process.env[k] ?? "").trim().length > 0),
      aktiv: false,
      letztePruefung: null,
      fehlerHintereinander: 0,
      notiz: "",
    };
    zustaende.set(def.id, z);
  }
  return z;
}

/**
 * Prüft EINEN Connector: Erreichbarkeit via fetch (falls URL gesetzt) oder
 * Konfigurationsprüfung. Aktualisiert den Zustand autonom.
 */
export async function pruefeConnector(id: string): Promise<ConnectorZustand | null> {
  const def = CONNECTORS.find((c) => c.id === id);
  if (!def) return null;
  const z = holeZustand(def);
  z.letztePruefung = new Date().toISOString();

  if (!z.konfiguriert) {
    z.aktiv = false;
    z.notiz = "Nicht konfiguriert — Credentials fehlen";
    return z;
  }

  try {
    if (def.url) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      await fetch(def.url, { method: "HEAD", signal: controller.signal });
      clearTimeout(timer);
    }
    z.aktiv = true;
    z.fehlerHintereinander = 0;
    z.notiz = "Erreichbar";
  } catch {
    z.fehlerHintereinander += 1;
    z.aktiv = false;
    z.notiz = `Nicht erreichbar (${z.fehlerHintereinander}× hintereinander)`;
  }
  return z;
}

/** Sweep über ALLE konfigurierten Connectors — Kernroutine des Changer-Agenten. */
export async function pruefeAlleConnector(): Promise<{
  geprueft: number;
  aktiv: number;
  deaktiviert: number;
  reaktiviert: number;
}> {
  let aktiv = 0;
  let deaktiviert = 0;
  let reaktiviert = 0;
  let geprueft = 0;

  for (const def of CONNECTORS) {
    const vorher = holeZustand(def);
    const z = await pruefeConnector(def.id);
    if (!z || !z.konfiguriert) continue;
    geprueft += 1;
    if (z.aktiv) {
      aktiv += 1;
      if (!vorher.aktiv && vorher.fehlerHintereinander > 0) reaktiviert += 1;
    } else {
      deaktiviert += 1;
    }
  }

  logger.info({ geprueft, aktiv, deaktiviert, reaktiviert }, "Connector-Sweep abgeschlossen");
  return { geprueft, aktiv, deaktiviert, reaktiviert };
}

export function holeConnectorSnapshot(): ConnectorZustand[] {
  for (const def of CONNECTORS) holeZustand(def);
  return [...zustaende.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function anzahlAktiveConnectors(): number {
  return holeConnectorSnapshot().filter((z) => z.aktiv).length;
}
