/**
 * /api/einstellungen — Konfiguration für Affiliate-Links, Webhooks, Setup-Schritte
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { systemConfigTable, setupSchritteTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { aktualisiereApiKey, aktualisiereVerfuegbarkeit } from "../lib/openaiClient";

const router = Router();

// ─── OPENAI API-KEY ──────────────────────────────────────────────────────────

router.get("/einstellungen/openai-key", async (_req, res) => {
  const rows = await db.select().from(systemConfigTable)
    .where(eq(systemConfigTable.schluessel, "openai_api_key"));
  const gesetzt = !!(rows[0]?.wert) || !!(process.env["OPENAI_API_KEY"]);
  const keyVorschau = rows[0]?.wert
    ? `${rows[0].wert.slice(0, 7)}...${rows[0].wert.slice(-4)}`
    : process.env["OPENAI_API_KEY"]
      ? `${process.env["OPENAI_API_KEY"].slice(0, 7)}...`
      : null;
  res.json({ gesetzt, keyVorschau, getestet: rows[0]?.aktiviert ?? false });
});

router.post("/einstellungen/openai-key", async (req, res) => {
  const { key } = req.body as { key: string };
  const sauber = key?.match(/sk-[a-zA-Z0-9\-_]{20,}/)?.[0] ?? key?.trim();

  if (!sauber || !sauber.startsWith("sk-")) {
    res.status(400).json({ fehler: "Ungültiger Key — muss mit 'sk-' beginnen" });
    return;
  }

  // Key direkt gegen OpenAI testen
  let gueltig = false;
  try {
    const testResp = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${sauber}` },
      signal: AbortSignal.timeout(10_000),
    });
    gueltig = testResp.ok;
  } catch {
    gueltig = false;
  }

  if (!gueltig) {
    res.status(422).json({
      fehler: "OpenAI lehnt diesen Key ab (401) — bitte prüfe ob der Key aktiv ist und das Spending-Limit > $0",
      key: `${sauber.slice(0, 7)}...${sauber.slice(-4)}`,
    });
    return;
  }

  // In DB speichern
  await db.insert(systemConfigTable).values({
    schluessel: "openai_api_key",
    wert: sauber,
    aktiviert: true,
  }).onConflictDoUpdate({
    target: systemConfigTable.schluessel,
    set: { wert: sauber, aktiviert: true, updatedAt: new Date() },
  });

  // In-Memory Client sofort aktualisieren (kein Server-Neustart nötig)
  aktualisiereApiKey(sauber);
  aktualisiereVerfuegbarkeit(true);

  req.log.info({ keyVorschau: `${sauber.slice(0, 7)}...` }, "OpenAI-Key gespeichert und aktiviert");
  res.json({ gespeichert: true, gueltig: true, key: `${sauber.slice(0, 7)}...${sauber.slice(-4)}` });
});

// ─── AFFILIATE-LINKS ────────────────────────────────────────────────────────

router.get("/einstellungen/affiliate-links", async (req, res) => {
  const rows = await db.select().from(systemConfigTable)
    .where(eq(systemConfigTable.schluessel, "affiliate_links"));
  const wert = rows[0]?.wert;
  const links = wert ? JSON.parse(wert) : defaultAffiliateLinks();
  res.json({ affiliateLinks: links });
});

router.post("/einstellungen/affiliate-links", async (req, res) => {
  const { affiliateLinks } = req.body as { affiliateLinks: AffiliateLink[] };
  if (!Array.isArray(affiliateLinks)) {
    res.status(400).json({ fehler: "affiliateLinks muss ein Array sein" });
    return;
  }
  await db.insert(systemConfigTable).values({
    schluessel: "affiliate_links",
    wert: JSON.stringify(affiliateLinks),
    aktiviert: true,
  }).onConflictDoUpdate({
    target: systemConfigTable.schluessel,
    set: { wert: JSON.stringify(affiliateLinks), updatedAt: new Date() },
  });
  req.log.info({ anzahl: affiliateLinks.length }, "Affiliate-Links gespeichert");
  res.json({ gespeichert: true, anzahl: affiliateLinks.length });
});

// ─── WEBHOOK-KONFIGURATION ───────────────────────────────────────────────────

router.get("/einstellungen/webhook", async (req, res) => {
  const rows = await db.select().from(systemConfigTable)
    .where(eq(systemConfigTable.schluessel, "webhook_url"));
  const url = rows[0]?.wert ?? null;
  const aktiv = rows[0]?.aktiviert ?? false;
  res.json({ webhookUrl: url, aktiv });
});

router.post("/einstellungen/webhook", async (req, res) => {
  const { webhookUrl, aktiv } = req.body as { webhookUrl: string; aktiv?: boolean };
  if (!webhookUrl || !webhookUrl.startsWith("http")) {
    res.status(400).json({ fehler: "Gültige HTTPS-URL erforderlich" });
    return;
  }
  await db.insert(systemConfigTable).values({
    schluessel: "webhook_url",
    wert: webhookUrl,
    aktiviert: aktiv ?? true,
  }).onConflictDoUpdate({
    target: systemConfigTable.schluessel,
    set: { wert: webhookUrl, aktiviert: aktiv ?? true, updatedAt: new Date() },
  });
  req.log.info({ webhookUrl }, "Webhook-URL gespeichert");
  res.json({ gespeichert: true, webhookUrl });
});

router.post("/einstellungen/webhook/testen", async (req, res) => {
  const rows = await db.select().from(systemConfigTable)
    .where(eq(systemConfigTable.schluessel, "webhook_url"));
  const url = rows[0]?.wert;
  if (!url) {
    res.status(400).json({ fehler: "Keine Webhook-URL konfiguriert" });
    return;
  }
  try {
    const testPayload = {
      ereignis: "webhook_test",
      system: "CyberSarah Revenue OS",
      zeitstempel: new Date().toISOString(),
      nachricht: "✅ Webhook-Verbindung erfolgreich — Content wird automatisch gesendet",
      beispielContent: {
        marke: "CyberSarah",
        typ: "tiktok",
        plattform: "TikTok",
        titel: "KI-Automatisierung 2026",
        inhalt: "Test-Content mit Affiliate-Link",
      },
    };
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testPayload),
      signal: AbortSignal.timeout(8000),
    });
    req.log.info({ url, status: resp.status }, "Webhook-Test gesendet");
    res.json({ erfolgreich: true, statusCode: resp.status, url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
    req.log.warn({ url, err: msg }, "Webhook-Test fehlgeschlagen");
    res.status(502).json({ erfolgreich: false, fehler: msg });
  }
});

// ─── SETUP-SCHRITTE ──────────────────────────────────────────────────────────

router.get("/einstellungen/setup", async (req, res) => {
  const schritte = await db.select().from(setupSchritteTable).orderBy(setupSchritteTable.id);
  const systemRows = await db.select().from(systemConfigTable);
  const configMap: Record<string, string | null> = {};
  for (const row of systemRows) configMap[row.schluessel] = row.wert ?? null;

  const openaiKey = process.env["OPENAI_API_KEY"] ?? process.env["Openaiapi"] ?? process.env["Openai"];

  res.json({
    schritte,
    systemStatus: {
      openaiKeyGesetzt: !!openaiKey && openaiKey.startsWith("sk-"),
      webhookKonfiguriert: !!(configMap["webhook_url"]),
      affiliateLinksKonfiguriert: !!(configMap["affiliate_links"]),
      stripeAktiv: !!process.env["STRIPE_SECRET_KEY"],
    },
  });
});

router.post("/einstellungen/setup/:schluessel/erledigt", async (req, res) => {
  const { schluessel } = req.params;
  const { metadaten } = req.body as { metadaten?: string };

  const existing = await db.select().from(setupSchritteTable)
    .where(eq(setupSchritteTable.schluessel, schluessel));

  if (existing.length === 0) {
    res.status(404).json({ fehler: "Schritt nicht gefunden" });
    return;
  }

  await db.update(setupSchritteTable)
    .set({ erledigt: true, erledigtAm: new Date(), metadaten: metadaten ?? null, updatedAt: new Date() })
    .where(eq(setupSchritteTable.schluessel, schluessel));

  req.log.info({ schluessel }, "Setup-Schritt als erledigt markiert");
  res.json({ erledigt: true, schluessel });
});

// ─── HILFSFUNKTIONEN ─────────────────────────────────────────────────────────

export interface AffiliateLink {
  marke: string;
  netzwerk: string;
  url: string;
  cta: string;
  provision?: string;
}

export function defaultAffiliateLinks(): AffiliateLink[] {
  return [
    { marke: "CyberSarah", netzwerk: "Amazon PartnerNet", url: "https://affiliate-program.amazon.de", cta: "🛒 KI-Tools & Technik bei Amazon", provision: "3-10%" },
    { marke: "CyberSarah", netzwerk: "Canva Affiliate", url: "https://www.canva.com/affiliates", cta: "🎨 Canva Pro kostenlos testen", provision: "15-30%" },
    { marke: "GeldPilot AI", netzwerk: "Digistore24", url: "https://www.digistore24.com/product/geldpilot", cta: "💰 GeldPilot AI Kurs — jetzt starten", provision: "25-60%" },
    { marke: "GeldPilot AI", netzwerk: "Copecart", url: "https://www.copecart.com", cta: "📈 Digitale Produkte verkaufen mit Copecart", provision: "25-50%" },
    { marke: "UnternehmerGPT", netzwerk: "Awin", url: "https://www.awin.com/de", cta: "🚀 Business-Tools entdecken auf Awin", provision: "5-15%" },
    { marke: "UnternehmerGPT", netzwerk: "Notion Affiliate", url: "https://www.notion.so/affiliates", cta: "📋 Notion für dein Business", provision: "10-20%" },
  ];
}

export async function ladeAffiliateLinksAusDB(): Promise<AffiliateLink[]> {
    if (!db) { res.json([]); return; }
  try {
    const rows = await db.select().from(systemConfigTable)
      .where(eq(systemConfigTable.schluessel, "affiliate_links"));
    if (rows[0]?.wert) return JSON.parse(rows[0].wert) as AffiliateLink[];
  } catch (err) {
    logger.warn({ err }, "Affiliate-Links aus DB fehlgeschlagen — Defaults genutzt");
  }
  return defaultAffiliateLinks();
}

export async function ladeWebhookUrlAusDB(): Promise<string | null> {
    if (!db) { res.json([]); return; }
  try {
    const rows = await db.select().from(systemConfigTable)
      .where(eq(systemConfigTable.schluessel, "webhook_url"));
    if (rows[0]?.aktiviert && rows[0]?.wert) return rows[0].wert;
  } catch {
    // Kein Crash
  }
  return null;
}

export default router;
