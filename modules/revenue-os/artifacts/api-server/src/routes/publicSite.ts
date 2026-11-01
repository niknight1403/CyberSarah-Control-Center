/**
 * Public Landing Page — Product Showcase + Blog Hub
 * Wird automatisch aktualisiert, wenn neue Produkte in Stripe erstellt werden.
 */
import { Router } from "express";
import { chatWidgetHtml } from "../lib/chatWidget";
import { newsletterWidgetHtml } from "../lib/newsletterWidget";
import { systemStatusBadgeHtml } from "../lib/systemWidget";
import { db } from "@workspace/db";
import { produkteTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

const PUBLIC_URL = process.env["PUBLIC_APP_URL"] ?? "http://167.233.196.20:3000";

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function renderPage(title: string, bodyHtml: string, description = "KI-gestütztes Revenue Operating System"): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}"/>
<meta name="robots" content="index, follow"/>
<meta property="og:title" content="${escape(title)}"/>
<meta property="og:description" content="${escape(description)}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${PUBLIC_URL}"/>
<meta name="twitter:card" content="summary_large_image"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0a0a0f;color:#e0e0e0;line-height:1.6}
.header{background:linear-gradient(135deg,#1a0a2e,#0d0d1a);padding:2rem 0;text-align:center;border-bottom:1px solid #2a1a4e}
.header h1{font-size:2rem;background:linear-gradient(90deg,#a855f7,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.header p{color:#9ca3af;margin-top:0.5rem}
.container{max-width:1200px;margin:0 auto;padding:1.5rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.5rem;padding:1.5rem 0}
.card{background:#111118;border:1px solid #1f1f2e;border-radius:12px;padding:1.5rem;transition:border-color .2s}
.card:hover{border-color:#a855f7}
.card h3{color:#f0f0f0;font-size:1.1rem;margin-bottom:0.5rem}
.card .price{font-size:1.5rem;font-weight:700;color:#a855f7;margin:0.5rem 0}
.card p{color:#9ca3af;font-size:0.9rem;margin-bottom:1rem}
.btn{display:inline-block;background:linear-gradient(90deg,#a855f7,#06b6d4);color:#fff;padding:0.7rem 1.5rem;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.9rem;border:none;cursor:pointer;width:100%;text-align:center}
.btn:hover{opacity:0.9}
.nav{text-align:center;padding:1rem 0;border-bottom:1px solid #1f1f2e}
.nav a{color:#a855f7;text-decoration:none;margin:0 1rem;font-weight:500}
.nav a:hover{color:#06b6d4}
.stats{display:flex;justify-content:center;gap:2rem;padding:1.5rem 0;flex-wrap:wrap}
.stat{text-align:center}
.stat .num{font-size:1.8rem;font-weight:700;color:#a855f7}
.stat .label{color:#6b7280;font-size:0.85rem;margin-top:0.2rem}
footer{border-top:1px solid #1f1f2e;padding:2rem 0;text-align:center;color:#6b7280;font-size:0.85rem}
@media(max-width:600px){.header h1{font-size:1.5rem}.grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="header">
<div class="container">
<h1>CyberSarah Revenue OS</h1>
<p>Autonomes KI-System für Online-Umsatz</p>
</div>
</div>
<div class="nav">
<a href="/">Start</a>
<a href="/blog">Blog</a>
<a href="/produkte">Produkte</a>
</div>
<div class="container">
${bodyHtml}
</div>
<footer>
<div class="container">
&copy; 2026 CyberSarah &middot; KI-gestützte Automatisierung &middot; <a href="/sitemap.xml" style="color:#6b7280">Sitemap</a>
</div>
</footer>
${systemStatusBadgeHtml()}${newsletterWidgetHtml()}${chatWidgetHtml()}
</body>
</html>`;
}

router.get("/", async (_req, res) => {
  try {
    const produkte = await db
      .select()
      .from(produkteTable)
      .where(eq(produkteTable.aktiv, true))
      .orderBy(desc(produkteTable.createdAt))
      .limit(12);

    const produktCards = produkte.map(p => {
      const preis = Number(p.preis ?? 0);
      const zahlungsLink = p.stripePaymentLink ?? "#";
      return `<div class="card">
<h3>${escape(p.name)}</h3>
<div class="price">€${preis.toFixed(2)}</div>
<p>${escape(p.beschreibung ?? "").substring(0, 120)}</p>
<a href="${escape(zahlungsLink)}" class="btn" target="_blank" rel="noopener">Jetzt kaufen</a>
</div>`;
    }).join("\n");

    const body = `
<div class="stats">
<div class="stat"><div class="num">100+</div><div class="label">Produkte</div></div>
<div class="stat"><div class="num">1400+</div><div class="label">Blog-Artikel</div></div>
<div class="stat"><div class="num">34</div><div class="label">KI-Agenten</div></div>
</div>
<h2 style="margin-top:2rem;color:#f0f0f0">Unsere Produkte</h2>
<div class="grid">
${produktCards || '<p style="color:#6b7280">Aktuell keine Produkte verfügbar.</p>'}
</div>
<p style="text-align:center;margin-top:2rem">
<a href="/blog" style="color:#a855f7">Zum Blog mit 1400+ Artikeln →</a>
</p>`;

    res.send(renderPage("CyberSarah Revenue OS — KI-gestütztes Umsatzsystem", body));
  } catch {
    res.send(renderPage("CyberSarah Revenue OS", "<p>Willkommen beim CyberSarah Revenue OS.</p><p><a href='/blog'>Zum Blog</a></p>"));
  }
});

router.get("/produkte", async (_req, res) => {
  try {
    const produkte = await db
      .select()
      .from(produkteTable)
      .where(eq(produkteTable.aktiv, true))
      .orderBy(desc(produkteTable.createdAt));

    const cards = produkte.map(p => {
      const preis = Number(p.preis ?? 0);
      const link = p.stripePaymentLink ?? "#";
      const kategorie = p.kategorie ?? "Allgemein";
      return `<div class="card">
<span style="font-size:0.75rem;color:#a855f7;text-transform:uppercase">${escape(kategorie)}</span>
<h3>${escape(p.name)}</h3>
<div class="price">€${preis.toFixed(2)}</div>
<p>${escape(p.beschreibung ?? "").substring(0, 200)}</p>
<a href="${escape(link)}" class="btn" target="_blank" rel="noopener">Jetzt kaufen →</a>
</div>`;
    }).join("\n");

    res.send(renderPage("Alle Produkte — CyberSarah Revenue OS", `
<h1 style="margin-bottom:1rem">Alle Produkte</h1>
<p style="color:#9ca3af;margin-bottom:1rem">${produkte.length} Produkte — alle mit Stripe-Zahlungsabwicklung</p>
<div class="grid">${cards || "<p>Keine Produkte verfügbar.</p>"}</div>
`));
  } catch {
    res.send(renderPage("Produkte — CyberSarah", "<p>Produkte konnten nicht geladen werden.</p>"));
  }
});

export default router;
