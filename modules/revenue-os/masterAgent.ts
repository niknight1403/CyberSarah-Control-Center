/**
 * MasterAgent – Orchestrator.
 *
 * Läuft als Intervall-Scheduler im api-server:
 *  - KeyAgent alle 10 Min (Konfiguration überwachen)
 *  - FinanceAgent alle 15 Min (echten Umsatz aggregieren)
 *  - SocialAgent 2x täglich (Content erzeugen/posten)
 *
 * Stellt einen Zustands-Snapshot bereit, den der neue Dashboard-Tab anzeigt.
 * Einbindung im Express-Server (Beispiel):
 *
 *   import { masterAgent } from "./agents/masterAgent";
 *   masterAgent.start();
 *   app.get("/api/master-agent", (_req, res) => res.json(masterAgent.getState()));
 *   app.post("/api/master-agent/run/:agent", async (req, res) =>
 *     res.json(await masterAgent.runNow(req.params.agent as any)));
 */

import { runKeyAgent, type KeyReport } from "./keyAgent";
import { runFinanceAgent, ensurePaymentLink, stripeMode, type RevenueReport } from "./financeAgent";
import { runSocialAgent, getSocialQueue, type SocialPost } from "./socialAgent";

export interface LogEntry { at: string; agent: string; level: "info" | "warn" | "error"; msg: string }

interface MasterState {
  running: boolean;
  startedAt: string | null;
  keys: KeyReport[];
  revenue: RevenueReport | null;
  socialQueue: SocialPost[];
  paymentLink: string | null;
  log: LogEntry[];
}

const state: MasterState = {
  running: false,
  startedAt: null,
  keys: [],
  revenue: null,
  socialQueue: [],
  paymentLink: null,
  log: [],
};

const timers: ReturnType<typeof setInterval>[] = [];

function log(agent: string, level: LogEntry["level"], msg: string) {
  state.log.unshift({ at: new Date().toISOString(), agent, level, msg });
  state.log = state.log.slice(0, 200);
}

async function keysTick() {
  try {
    state.keys = await runKeyAgent();
    const bad = state.keys.filter(k => k.status === "invalid");
    const missing = state.keys.filter(k => k.status === "missing");
    if (bad.length) log("KeyAgent", "error", `Ungültig: ${bad.map(b => b.service).join(", ")}`);
    if (missing.length) log("KeyAgent", "warn", `Fehlend: ${missing.map(m => m.service).join(", ")}`);
    if (!bad.length && !missing.length) log("KeyAgent", "info", "Alle Zugänge in Ordnung.");
  } catch (e) { log("KeyAgent", "error", (e as Error).message); }
}

async function financeTick() {
  if (stripeMode() === "missing") { log("FinanceAgent", "warn", "Wartet auf Stripe-Key."); return; }
  try {
    // Sicherstellen, dass etwas Verkaufbares existiert (idempotent)
    const name = process.env.PRODUCT_NAME ?? "CyberSarah Service";
    const cents = Number(process.env.PRODUCT_PRICE_CENTS ?? 4900);
    const link = await ensurePaymentLink(name, cents);
    state.paymentLink = link.url;
    if (link.created) log("FinanceAgent", "info", `Payment-Link angelegt: ${link.url}`);

    state.revenue = await runFinanceAgent();
    const r = state.revenue;
    log(
      "FinanceAgent",
      "info",
      `${r.mode === "live" ? "Umsatz" : "TEST-Umsatz"} 24h: ${(r.last24hCents / 100).toFixed(2)} ${r.currency.toUpperCase()} | 7T: ${(r.last7dCents / 100).toFixed(2)} (${r.chargeCount7d} Zahlungen, ${r.failed7d} fehlgeschlagen)`,
    );
  } catch (e) { log("FinanceAgent", "error", (e as Error).message); }
}

async function socialTick() {
  try {
    const topics = (process.env.SOCIAL_TOPICS ?? "Automatisierung im Alltag,Produkt-Update")
      .split(",").map(t => t.trim()).filter(Boolean);
    const posts = await runSocialAgent(topics.slice(0, 2));
    state.socialQueue = getSocialQueue();
    for (const p of posts) log("SocialAgent", p.status === "failed" ? "error" : "info", `${p.platform}: ${p.detail}`);
  } catch (e) { log("SocialAgent", "error", (e as Error).message); }
}

export const masterAgent = {
  start() {
    if (state.running) return;
    state.running = true;
    state.startedAt = new Date().toISOString();
    log("MasterAgent", "info", "Gestartet – Agenten laufen autonom.");
    void keysTick(); void financeTick();
    timers.push(setInterval(keysTick, 10 * 60_000));
    timers.push(setInterval(financeTick, 15 * 60_000));
    timers.push(setInterval(socialTick, 12 * 60 * 60_000));
  },
  stop() {
    timers.forEach(clearInterval); timers.length = 0;
    state.running = false;
    log("MasterAgent", "info", "Gestoppt.");
  },
  async runNow(agent: "keys" | "finance" | "social") {
    if (agent === "keys") await keysTick();
    if (agent === "finance") await financeTick();
    if (agent === "social") await socialTick();
    return this.getState();
  },
  getState(): MasterState { return { ...state, socialQueue: getSocialQueue() }; },
};
