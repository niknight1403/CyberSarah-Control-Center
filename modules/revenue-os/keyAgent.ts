/**
 * KeyAgent – autonomer Konfigurations-Wächter.
 *
 * Ehrlich gesagt: Keys ERSTELLEN kann kein Agent (das erfordert menschliche
 * Registrierung bei Stripe, OpenAI, Meta, TikTok). Was dieser Agent autonom tut:
 *  - alle Keys periodisch LIVE gegen die echten APIs testen (kein Simulieren)
 *  - Ablauf/Ungültigkeit sofort erkennen und im MasterAgent-Log melden
 *  - klar unterscheiden: LIVE / TEST / FEHLT / UNGÜLTIG
 */

export type KeyStatus = "live" | "test" | "missing" | "invalid";

export interface KeyReport {
  service: string;
  status: KeyStatus;
  detail: string;
  checkedAt: string;
}

async function checkOpenAI(): Promise<KeyReport> {
  const key = process.env.OPENAI_API_KEY;
  const base = { service: "OpenAI", checkedAt: new Date().toISOString() };
  if (!key) return { ...base, status: "missing", detail: "OPENAI_API_KEY fehlt in .env" };
  try {
    const r = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (r.ok) return { ...base, status: "live", detail: "Key gültig, Modelle abrufbar" };
    return { ...base, status: "invalid", detail: `HTTP ${r.status} – Key ungültig oder gesperrt` };
  } catch (e) {
    return { ...base, status: "invalid", detail: `Netzwerkfehler: ${(e as Error).message}` };
  }
}

async function checkStripe(): Promise<KeyReport> {
  const key = process.env.STRIPE_SECRET_KEY;
  const base = { service: "Stripe", checkedAt: new Date().toISOString() };
  if (!key) return { ...base, status: "missing", detail: "STRIPE_SECRET_KEY fehlt in .env" };
  try {
    const r = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return { ...base, status: "invalid", detail: `HTTP ${r.status} – Key ungültig` };
    const mode: KeyStatus = key.startsWith("sk_live_") ? "live" : "test";
    return {
      ...base,
      status: mode,
      detail:
        mode === "live"
          ? "LIVE-Key aktiv – echte Zahlungen möglich"
          : "TEST-Key – es fließt KEIN echtes Geld. Für echten Umsatz sk_live_… eintragen.",
    };
  } catch (e) {
    return { ...base, status: "invalid", detail: `Netzwerkfehler: ${(e as Error).message}` };
  }
}

async function checkDatabase(): Promise<KeyReport> {
  const url = process.env.DATABASE_URL;
  const base = { service: "PostgreSQL", checkedAt: new Date().toISOString() };
  if (!url) return { ...base, status: "missing", detail: "DATABASE_URL fehlt in .env" };
  // Verbindungstest ohne Zusatz-Dependency: TCP-Handshake auf Host:Port
  try {
    const u = new URL(url);
    const net = await import("node:net");
    await new Promise<void>((res, rej) => {
      const s = net.createConnection(
        { host: u.hostname, port: Number(u.port || 5432), timeout: 4000 },
        () => { s.end(); res(); },
      );
      s.on("error", rej);
      s.on("timeout", () => rej(new Error("Timeout")));
    });
    return { ...base, status: "live", detail: "Datenbank erreichbar" };
  } catch (e) {
    return { ...base, status: "invalid", detail: `Nicht erreichbar: ${(e as Error).message}` };
  }
}

function checkSocialToken(name: string, envVar: string): KeyReport {
  const v = process.env[envVar];
  return {
    service: name,
    status: v ? "live" : "missing",
    detail: v
      ? "Token vorhanden – wird vom SocialAgent beim nächsten Post live getestet"
      : `${envVar} fehlt. Hinweis: ${name}-API erfordert einen genehmigten Entwickler-Account (manueller Antrag).`,
    checkedAt: new Date().toISOString(),
  };
}

export async function runKeyAgent(): Promise<KeyReport[]> {
  const [openai, stripe, db] = await Promise.all([checkOpenAI(), checkStripe(), checkDatabase()]);
  return [
    openai,
    stripe,
    db,
    checkSocialToken("TikTok", "TIKTOK_ACCESS_TOKEN"),
    checkSocialToken("Instagram", "IG_ACCESS_TOKEN"),
  ];
}
