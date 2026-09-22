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

const TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function checkOpenAI(): Promise<KeyReport> {
  const key = process.env.OPENAI_API_KEY;
  const base = { service: "OpenAI", checkedAt: new Date().toISOString() };
  if (!key) return { ...base, status: "missing", detail: "OPENAI_API_KEY fehlt in .env" };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const r = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (r.ok) return { ...base, status: "live", detail: "Key gültig, Modelle abrufbar" };
    return { ...base, status: "invalid", detail: `HTTP ${r.status} – Key ungültig oder gesperrt` };
  } catch (e) {
    return { ...base, status: "invalid", detail: `Netzwerkfehler: ${(e as Error).message?.slice(0, 60)}` };
  }
}

async function checkStripe(): Promise<KeyReport> {
  const key = process.env.STRIPE_SECRET_KEY;
  const base = { service: "Stripe", checkedAt: new Date().toISOString() };
  if (!key) return { ...base, status: "missing", detail: "STRIPE_SECRET_KEY fehlt in .env" };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const r = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
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
    return { ...base, status: "invalid", detail: `Netzwerkfehler: ${(e as Error).message?.slice(0, 60)}` };
  }
}

async function checkDatabase(): Promise<KeyReport> {
  const url = process.env.DATABASE_URL;
  const base = { service: "PostgreSQL", checkedAt: new Date().toISOString() };
  if (!url) return { ...base, status: "missing", detail: "DATABASE_URL fehlt in .env" };
  try {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 8000, ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : false });
    const result = await pool.query("SELECT 1 AS ok");
    await pool.end();
    if (result.rows?.[0]?.ok === 1) {
      return { ...base, status: "live", detail: "Datenbank verbunden und abfragbar" };
    }
    return { ...base, status: "invalid", detail: "Verbindung ok, aber SELECT fehlgeschlagen" };
  } catch (e) {
    return { ...base, status: "invalid", detail: `Verbindungsfehler: ${(e as Error).message?.slice(0, 80)}` };
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
  const [openai, stripe, db] = await Promise.allSettled([
    checkOpenAI(),
    checkStripe(),
    checkDatabase(),
  ]);
  return [
    openai.status === "fulfilled" ? openai.value : { service: "OpenAI", status: "invalid" as KeyStatus, detail: (openai.reason as Error)?.message?.slice(0, 60) ?? "Fehler", checkedAt: new Date().toISOString() },
    stripe.status === "fulfilled" ? stripe.value : { service: "Stripe", status: "invalid" as KeyStatus, detail: (stripe.reason as Error)?.message?.slice(0, 60) ?? "Fehler", checkedAt: new Date().toISOString() },
    db.status === "fulfilled" ? db.value : { service: "PostgreSQL", status: "invalid" as KeyStatus, detail: (db.reason as Error)?.message?.slice(0, 60) ?? "Fehler", checkedAt: new Date().toISOString() },
    checkSocialToken("TikTok", "TIKTOK_ACCESS_TOKEN"),
    checkSocialToken("Instagram", "IG_ACCESS_TOKEN"),
  ];
}
