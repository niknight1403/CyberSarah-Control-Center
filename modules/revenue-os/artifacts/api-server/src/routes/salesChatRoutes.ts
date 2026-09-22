/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AI SALES CHAT API (Sprint 5.2)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { salesConversationsTable, salesChatLeadsTable } from "@workspace/db";
import { eq, desc, gte, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// ─── Neue Nachricht senden ──────────────────────────────────────────────────
router.post("/chat/message", async (req, res) => {
  const { message, sessionId, email } = req.body as any;
  if (!message) { res.status(400).json({ error: "message erforderlich" }); return; }

  const sid = sessionId || "chat-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);
  const { SalesChatAgent } = await import("../agents/SalesChatAgent");
  const agent = new SalesChatAgent();
  const result = await agent.verarbeiteNachricht(sid, message, email);

  res.json({
    nachricht: result.message,
    sessionId: sid,
    checkoutLink: result.metadaten?.checkoutLink ?? null,
    couponCode: result.metadaten?.couponCode ?? null,
    stimmung: result.metadaten?.stimmung ?? null,
  });
});

// ─── Konversationen ─────────────────────────────────────────────────────────
router.get("/chat/conversations", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
  const conversations = await db.select().from(salesConversationsTable).orderBy(desc(salesConversationsTable.updatedAt)).limit(limit);
  res.json({ conversations, anzahl: conversations.length });
});

router.get("/chat/conversations/:sessionId", async (req, res) => {
  const [conv] = await db.select().from(salesConversationsTable).where(eq(salesConversationsTable.sessionId, req.params.sessionId)).limit(1);
  if (!conv) { res.status(404).json({ error: "Nicht gefunden" }); return; }
  let nachrichten: any[] = [];
  try { nachrichten = JSON.parse(typeof conv.nachrichten === "string" ? conv.nachrichten : JSON.stringify(conv.nachrichten)); } catch {}
  res.json({ conversation: conv, nachrichten });
});

// ─── Leads ──────────────────────────────────────────────────────────────────
router.get("/chat/leads", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "50")), 200);
  const leads = await db.select().from(salesChatLeadsTable).orderBy(desc(salesChatLeadsTable.createdAt)).limit(limit);
  res.json({ leads, anzahl: leads.length });
});

// ─── Stats ──────────────────────────────────────────────────────────────────
router.get("/chat/stats", async (_req, res) => {
  const vor30Tagen = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const conversations = await db.select().from(salesConversationsTable).where(gte(salesConversationsTable.createdAt, vor30Tagen));
  const konvertiert = conversations.filter(c => c.konvertiert);
  const gesamtUmsatz = konvertiert.reduce((s, c) => s + parseFloat(c.umsatz ?? "0"), 0);
  const stimmungen: Record<string, number> = {};
  for (const c of conversations) { const s = c.stimmung ?? "neutral"; stimmungen[s] = (stimmungen[s] ?? 0) + 1; }
  const leadsCount = await db.select({ count: sql<number>`COUNT(*)` }).from(salesChatLeadsTable);
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const heuteCount = conversations.filter(c => new Date(c.createdAt) >= heute).length;

  res.json({
    gespraecheGesamt: conversations.length, heute: heuteCount,
    konvertiert: konvertiert.length, umsatz: gesamtUmsatz.toFixed(2),
    konversionsRate: conversations.length > 0 ? ((konvertiert.length / conversations.length) * 100).toFixed(1) + "%" : "0%",
    stimmungen, leads: Number(leadsCount[0]?.count ?? 0),
  });
});

// ─── Als konvertiert markieren ──────────────────────────────────────────────
router.post("/chat/conversations/:sessionId/convert", async (req, res) => {
  const { transaktionsId, umsatz } = req.body as any;
  await db.update(salesConversationsTable)
    .set({ konvertiert: true, transaktionsId: transaktionsId ?? null, umsatz: umsatz ? String(umsatz) : null, updatedAt: new Date() })
    .where(eq(salesConversationsTable.sessionId, req.params.sessionId));
  res.json({ erfolg: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EMBEDDABLE CHAT WIDGET (served as static JS)
// ═══════════════════════════════════════════════════════════════════════════════
router.get("/chat/widget.js", async (_req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(JS_CODE);
});

const JS_CODE = [
  '(function() {',
  'var API = window.location.origin + "/api/chat/message";',
  'var SID = "chat-" + Date.now() + "-" + Math.random().toString(36).substring(2,6);',
  'var d = document;',
  'var w = d.createElement("div");',
  'w.innerHTML = \'<div id="cs-chat" style="position:fixed;bottom:20px;right:20px;z-index:999999;font-family:system-ui,sans-serif;">\'',
  '+ \'<div id="cs-btn" style="width:60px;height:60px;border-radius:30px;background:#7c3aed;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 20px rgba(124,58,237,0.4);font-size:28px;">\\uD83D\\uDCAC</div>\'',
  '+ \'<div id="cs-box" style="display:none;position:absolute;bottom:70px;right:0;width:360px;height:520px;background:#1a1a2e;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.5);overflow:hidden;border:1px solid rgba(124,58,237,0.3);flex-direction:column;">\'',
  '+ \'<div style="background:#7c3aed;padding:14px 18px;color:#fff;font-weight:600;display:flex;justify-content:space-between;align-items:center;"><span>\\uD83E\\uDD16 Sarah - KI-Verkauf</span><span id="cs-close" style="cursor:pointer;opacity:0.8;">\\u2715</span></div>\'',
  '+ \'<div id="cs-msgs" style="flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;background:#0f0d2e;"></div>\'',
  '+ \'<div style="padding:10px 12px;border-top:1px solid #222;display:flex;gap:8px;background:#1a1a2e;"><input id="cs-inp" type="text" placeholder="Nachricht..." style="flex:1;padding:10px 14px;border-radius:10px;border:1px solid #333;background:#0f0d2e;color:#fff;font-size:14px;outline:none;" /><button id="cs-snd" style="width:40px;height:40px;border-radius:10px;border:none;background:#7c3aed;color:#fff;cursor:pointer;font-size:18px;">\\u27A4</button></div>\'',
  '+ \'</div></div>\';',
  'd.body.appendChild(w);',
  'function addMsg(t, r) { var div = d.createElement("div"); div.style.cssText = "padding:10px 14px;border-radius:12px;color:#ddd;font-size:14px;max-width:80%;" + (r === "user" ? "align-self:flex-end;background:#7c3aed;color:#fff;" : "align-self:flex-start;background:#1e1b4b;"); div.textContent = t; d.getElementById("cs-msgs").appendChild(div); d.getElementById("cs-msgs").scrollTop = d.getElementById("cs-msgs").scrollHeight; }',
  'function addLoading() { var div = d.createElement("div"); div.id = "cs-load"; div.style.cssText = "padding:10px 14px;border-radius:12px;color:#888;font-size:14px;align-self:flex-start;background:#1e1b4b;"; div.textContent = "\\uD83D\\uDCAD Sarah denkt..."; d.getElementById("cs-msgs").appendChild(div); }',
  'function rmLoading() { var el = d.getElementById("cs-load"); if (el) el.remove(); }',
  'd.getElementById("cs-btn").onclick = function() { d.getElementById("cs-box").style.display = "flex"; this.style.display = "none"; };',
  'd.getElementById("cs-close").onclick = function() { d.getElementById("cs-box").style.display = "none"; d.getElementById("cs-btn").style.display = "flex"; };',
  'function send() { var inp = d.getElementById("cs-inp"); var t = inp.value.trim(); if (!t) return; inp.value = ""; addMsg(t, "user"); addLoading(); fetch(API, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({message:t, sessionId:SID}) }).then(function(r) { return r.json(); }).then(function(d2) { rmLoading(); addMsg(d2.nachricht || "OK", "assistant"); if (d2.checkoutLink) { var a = d.createElement("a"); a.href = d2.checkoutLink; a.target = "_blank"; a.style.cssText = "display:inline-block;padding:10px 20px;background:#22c55e;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;margin:4px 0;"; a.textContent = "\\uD83D\\uDED2 Jetzt kaufen"; addMsg("", "assistant"); d.getElementById("cs-msgs").appendChild(a); } }).catch(function() { rmLoading(); addMsg("Fehler. Bitte versuche es später.", "assistant"); }); }',
  'd.getElementById("cs-snd").onclick = send;',
  'd.getElementById("cs-inp").onkeypress = function(e) { if (e.key === "Enter") send(); };',
  'addMsg("\\uD83D\\uDC4B Hey! Ich bin Sarah, deine KI-Verkaufsassistentin. Wie kann ich dir helfen?", "assistant");',
  '})();',
].join("\n");

export default router;
