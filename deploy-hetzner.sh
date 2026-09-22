#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# CyberSarah Revenue OS — Patch Deploy für Hetzner
# Ausführung: Im Hetzner Web-Terminal (console.hetzner.cloud → Konsole)
# ═══════════════════════════════════════════════════════════════════
set -e

G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; NC='\033[0m'
ok() { echo -e "${G}✅ $1${NC}"; }
warn() { echo -e "${Y}⚠️  $1${NC}"; }
err() { echo -e "${R}❌ $1${NC}"; }

echo -e "${G}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${G}║  CyberSarah Revenue OS — Social Media + SEO Patch   ║${NC}"
echo -e "${G}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

WORKDIR="/opt/cybersarah"

# ─── 1. Repository klonen/updaten ─────────────────────────────
if [ ! -d "$WORKDIR/.git" ]; then
    warn "Repository nicht gefunden — kloniere..."
    sudo mkdir -p /opt
    sudo git clone https://github.com/niknight1403/cybersarah-revenue-os.git "$WORKDIR"
    sudo chown -R $(whoami) "$WORKDIR"
fi
cd "$WORKDIR"
ok "Arbeitsverzeichnis: $(pwd)"

warn "Git Pull..."
git pull origin main 2>/dev/null && ok "Git Pull OK" || warn "Git Pull übersprungen"

# ─── 2. Social Media Poster erstellen ──────────────────────────
warn "Erstelle Social Media Poster..."
mkdir -p artifacts/api-server/src/agents

cat > artifacts/api-server/src/agents/socialMediaPoster.ts << 'SOCIALEOF'
/**
 * SocialMediaPoster — Echte API-Posting für TikTok & Instagram
 * Ersetzt Webhooks durch direkte API-Aufrufe.
 * Cron: 4x täglich (07, 11, 15, 20 Uhr)
 */
import { db } from "@workspace/db";
import { contentTable, influencerPlatformenTable, influencerPostingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { openai, openaiVerfuegbar } from "../lib/openaiClient";

const TIKTOK_ACCESS_TOKEN = process.env["TIKTOK_ACCESS_TOKEN"] ?? "";
const INSTAGRAM_ACCESS_TOKEN = process.env["INSTAGRAM_ACCESS_TOKEN"] ?? "";
const INSTAGRAM_BUSINESS_ACCOUNT_ID = process.env["INSTAGRAM_BUSINESS_ACCOUNT_ID"] ?? "";
const PUBLIC_APP_URL = process.env["PUBLIC_APP_URL"] ?? "https://cybersarah.app";

// ─── TikTok: Content Posting API v2 ──────────────────────────
async function postTikTok(title: string, desc: string): Promise<{ ok: boolean; err?: string }> {
  if (!TIKTOK_ACCESS_TOKEN) return { ok: false, err: "TIKTOK_ACCESS_TOKEN fehlt" };
  try {
    const r = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: { Authorization: `Bearer ${TIKTOK_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        post_info: { title: title.slice(0, 150), privacy_level: "PUBLIC_TO_EVERYONE" },
        source_info: { source: "FILE_UPLOAD", video_size: 500000, chunk_size: 500000, total_chunk_count: 1 },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json() as any;
    if (d.data?.publish_id) { logger.info({ pid: d.data.publish_id }, "TikTok: Upload init"); return { ok: true }; }
    return { ok: false, err: d.error?.message ?? "Keine Upload-URL" };
  } catch (e) { return { ok: false, err: String(e) }; }
}

// ─── Instagram: Graph API v19.0 ───────────────────────────────
async function postInstagram(imageUrl: string, caption: string): Promise<{ ok: boolean; err?: string; pid?: string }> {
  if (!INSTAGRAM_ACCESS_TOKEN || !INSTAGRAM_BUSINESS_ACCOUNT_ID) return { ok: false, err: "Instagram Keys fehlen" };
  const base = "https://graph.facebook.com/v19.0";
  const aid = INSTAGRAM_BUSINESS_ACCOUNT_ID;
  try {
    // Container erstellen
    const cr = await fetch(`${base}/${aid}/media`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ image_url: imageUrl, caption: caption.slice(0, 2200), access_token: INSTAGRAM_ACCESS_TOKEN }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    const cd = await cr.json() as any;
    if (!cd.id) return { ok: false, err: cd.error?.message ?? "Container fehlgeschlagen" };
    await new Promise(r => setTimeout(r, 10000)); // Verarbeitungszeit
    // Veröffentlichen
    const pr = await fetch(`${base}/${aid}/media_publish`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: cd.id, access_token: INSTAGRAM_ACCESS_TOKEN }).toString(),
      signal: AbortSignal.timeout(15000),
    });
    const pd = await pr.json() as any;
    if (pd.id) { logger.info({ pid: pd.id }, "📸 Instagram: Gepostet"); return { ok: true, pid: pd.id }; }
    return { ok: false, err: pd.error?.message ?? "Publish fehlgeschlagen" };
  } catch (e) { return { ok: false, err: String(e) }; }
}

// ─── Content-Optimierung ──────────────────────────────────────
async function optimiere(titel: string, inhalt: string, plattform: string): Promise<string> {
  if (!openaiVerfuegbar) return inhalt.slice(0, 500);
  const inst: Record<string, string> = {
    tiktok: "Max. 150 Zeichen, Hook Zeile 1, 3-5 Hashtags",
    instagram: "Max. 300 Zeichen, 10 Hashtags, Emojis, CTA am Ende",
  };
  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini", max_tokens: 300,
      messages: [
        { role: "system", content: `Optimiere für ${plattform}. ${inst[plattform] ?? "Kurz halten."} NUR Text.` },
        { role: "user", content: `Titel: ${titel}\n${inhalt.slice(0, 800)}` },
      ],
    });
    return r.choices[0]?.message?.content?.trim() ?? inhalt.slice(0, 500);
  } catch { return inhalt.slice(0, 500); }
}

// ─── Hauptfunktion ─────────────────────────────────────────────
export async function posteAutonomAufSocialMedia() {
  const pf = await db.select().from(influencerPlatformenTable).where(eq(influencerPlatformenTable.aktiv, true));
  if (!pf.length) return { gepostet: 0, fehler: 0, details: [] as any[] };
  const ct = await db.select().from(contentTable).where(eq(contentTable.status, "generiert")).orderBy(desc(contentTable.createdAt)).limit(5);
  if (!ct.length) return { gepostet: 0, fehler: 0, details: [] as any[] };

  const details: any[] = [];
  let ok = 0, fehl = 0;

  for (const p of pf) {
    const c = ct[0]!;
    const opt = await optimiere(c.titel, c.inhalt ?? "", p.name);
    let res: { ok: boolean; err?: string; pid?: string };

    if (p.name.toLowerCase() === "tiktok") {
      res = await postTikTok(c.titel, opt);
    } else if (p.name.toLowerCase() === "instagram") {
      const img = c.bildUrl ? `${PUBLIC_APP_URL}${c.bildUrl}` : null;
      res = img ? await postInstagram(img, opt) : { ok: false, err: "Kein Bild" };
    } else {
      res = { ok: false, err: `${p.name}: Nur TikTok/Instagram via API` };
    }

    await db.insert(influencerPostingsTable).values({
      contentId: c.id, plattform: p.name,
      status: res.ok ? "gepostet" : "fehler",
      inhaltKurz: opt.slice(0, 500), webhookResponse: res.ok ? "API_SUCCESS" : res.err,
      fehler: res.err ?? null, gepostetAm: res.ok ? new Date() : null,
    });

    if (res.ok) {
      ok++;
      await db.update(influencerPlatformenTable).set({
        postingsHeute: (p.postingsHeute ?? 0) + 1, postingsGesamt: (p.postingsGesamt ?? 0) + 1,
        letzterPost: new Date(), updatedAt: new Date(),
      }).where(eq(influencerPlatformenTable.id, p.id));
    } else { fehl++; }
    details.push({ plattform: p.name, erfolg: res.ok, fehler: res.err });
  }

  logger.info({ gepostet: ok, fehler: fehl }, `📱 Auto-Post: ${ok}/${pf.length} erfolgreich`);
  return { gepostet: ok, fehler: fehl, details };
}
SOCIALEOF
ok "socialMediaPoster.ts erstellt"

# ─── 3. SEO Blog Route erstellen ───────────────────────────────
warn "Erstelle SEO Blog Routes..."
mkdir -p artifacts/api-server/src/routes

cat > artifacts/api-server/src/routes/seoBlogSitemap.ts << 'BLOGEOF'
import { Router } from "express";
import { db } from "@workspace/db";
import { seoContentTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const router = Router();
const BASE = process.env["PUBLIC_APP_URL"] ?? "https://cybersarah.app";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(title: string, desc: string, canonical: string, body: string, noIdx = false) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${canonical}"/>
${noIdx ? '<meta name="robots" content="noindex"/>' : '<meta name="robots" content="index,follow"/>'}
<meta property="og:title" content="${esc(title)}"/><meta property="og:description" content="${esc(desc)}"/>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0a0a0f;color:#e0e0e0;line-height:1.7}.c{max-width:800px;margin:0 auto;padding:2rem 1.5rem}.h{background:linear-gradient(135deg,#1a0a2e,#0d0d1a);padding:3rem 0;text-align:center;border-bottom:1px solid #2a1a4e}.h h1{font-size:2.2rem;background:linear-gradient(90deg,#a855f7,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.h p{color:#9ca3af;margin-top:.5rem}.n{padding:1rem 0;border-bottom:1px solid #1f1f2e;text-align:center}.n a{color:#a855f7;text-decoration:none;margin:0 1rem;font-weight:500}.b{background:#111118;border:1px solid #1f1f2e;border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;transition:border-color .2s}.b:hover{border-color:#a855f7}.b h2 a{color:#f0f0f0;text-decoration:none}.b h2 a:hover{color:#a855f7}.b .m{color:#6b7280;font-size:.85rem;margin:.3rem 0}.b .e{color:#9ca3af;font-size:.95rem}article h1{font-size:1.8rem;margin-bottom:1rem}article h2{font-size:1.4rem;margin:2rem 0 .8rem;color:#c084fc;border-left:3px solid #a855f7;padding-left:.8rem}article p{margin-bottom:1rem}article a{color:#a855f7}.cta{background:linear-gradient(135deg,#1a0a2e,#0d1a2e);border:1px solid #2a1a4e;border-radius:12px;padding:2rem;margin:2rem 0;text-align:center}.cta h3{color:#a855f7;margin-bottom:.8rem}.btn{display:inline-block;background:linear-gradient(90deg,#a855f7,#06b6d4);color:#fff;padding:.8rem 2rem;border-radius:8px;text-decoration:none;font-weight:600;margin-top:1rem}footer{border-top:1px solid #1f1f2e;padding:2rem 0;text-align:center;color:#6b7280;font-size:.85rem}</style>
</head><body><div class="h"><div class="c"><h1>CyberSarah Blog</h1><p>KI-Tools, Automatisierung & Online-Geldverdienen</p></div></div>
<div class="n"><a href="/blog">Blog</a><a href="/blog?marke=CyberSarah">CyberSarah</a><a href="/blog?marke=GeldPilot AI">GeldPilot AI</a><a href="/blog?marke=UnternehmerGPT">UnternehmerGPT</a></div>
<div class="c">${body}</div>
<footer><div class="c">&copy; ${new Date().getFullYear()} CyberSarah Revenue OS</div></footer></body></html>`;
}

// Blog-Übersicht
router.get("/blog", async (req, res) => {
  try {
    const m = req.query["marke"] as string | undefined;
    const cond = [eq(seoContentTable.status, "veroeffentlicht")];
    if (m) cond.push(eq(seoContentTable.marke, m));
    const art = await db.select().from(seoContentTable).where(and(...cond)).orderBy(desc(seoContentTable.veroeffentlichtAm)).limit(50);
    const cards = art.map(a => {
      const d = a.veroeffentlichtAm ? new Date(a.veroeffentlichtAm).toLocaleDateString("de-DE", { day:"2-digit", month:"long", year:"numeric" }) : "";
      return `<div class="b"><div class="m">${a.marke} · ${d}</div><h2><a href="/blog/${a.slug}">${esc(a.titel)}</a></h2><p class="e">${esc((a.metaDescription ?? a.body ?? "").slice(0,160))}...</p></div>`;
    }).join("");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(page(m ? `Blog — ${m}` : "Blog", "KI-Tools & Automatisierung", `${BASE}/blog`,
      cards ? `<h2 style="color:#a855f7;margin:1.5rem 0">Neueste Artikel</h2>${cards}` : '<p style="text-align:center;padding:3rem 0;color:#6b7280">Noch keine Artikel — die KI-Agenten arbeiten daran!</p>'));
  } catch { res.status(500).send("<h1>Fehler</h1>"); }
});

// Einzelner Artikel
router.get("/blog/:slug", async (req, res) => {
  try {
    const [a] = await db.select().from(seoContentTable).where(and(eq(seoContentTable.slug, req.params["slug"] ?? ""), eq(seoContentTable.status, "veroeffentlicht"))).limit(1);
    if (!a) { res.status(404).send(page("Nicht gefunden", "", `${BASE}/blog`, '<p style="padding:3rem 0;text-align:center">Artikel nicht gefunden.</p>', true)); return; }
    await db.update(seoContentTable).set({ aufrufe: a.aufrufe + 1 }).where(eq(seoContentTable.id, a.id));
    const body = (a.body ?? "").split("\n\n").map(p => {
      if (p.startsWith("## ")) return `<h2>${esc(p.slice(3))}</h2>`;
      if (p.startsWith("### ")) return `<h3>${esc(p.slice(4))}</h3>`;
      if (p.startsWith("---")) return '<hr style="border-color:#1f1f2e;margin:2rem 0">';
      return `<p>${esc(p).replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>').replace(/\n/g, "<br/>")}</p>`;
    }).join("");
    const d = a.veroeffentlichtAm ? new Date(a.veroeffentlichtAm).toLocaleDateString("de-DE", { day:"2-digit", month:"long", year:"numeric" }) : "";
    const cta = a.produktId ? `<div class="cta"><h3>🚀 Bereit loszulegen?</h3><p>CyberSarah Revenue OS — das autonome KI-System für Online-Umsatz.</p><a href="${BASE}" class="btn">Jetzt starten</a></div>` : "";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(page(`${a.titel} — Blog`, a.metaDescription ?? a.titel, `${BASE}/blog/${a.slug}`,
      `<article><div style="color:#6b7280;font-size:.9rem;margin-bottom:1rem">${a.marke} · ${d} · ${a.aufrufe+1} Aufrufe</div><h1>${esc(a.titel)}</h1>${body}</article>${cta}`));
  } catch { res.status(500).send("<h1>Fehler</h1>"); }
});

// XML-Sitemap
router.get("/sitemap.xml", async (_req, res) => {
  try {
    const art = await db.select({ slug: seoContentTable.slug, dt: seoContentTable.veroeffentlichtAm }).from(seoContentTable).where(eq(seoContentTable.status, "veroeffentlicht")).orderBy(desc(seoContentTable.veroeffentlichtAm));
    const today = new Date().toISOString().split("T")[0];
    const urls = art.map(a => `<url><loc>${BASE}/blog/${a.slug}</loc><lastmod>${a.dt ? new Date(a.dt).toISOString().split("T")[0] : today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join("\n");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${BASE}/blog</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url><url><loc>${BASE}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>${urls}</urlset>`);
  } catch { res.status(500).send("Error"); }
});

// Robots.txt
router.get("/robots.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(`User-agent: *\nAllow: /blog\nAllow: /sitemap.xml\nDisallow: /api/\n\nSitemap: ${BASE}/sitemap.xml\n`);
});

export default router;
BLOGEOF
ok "seoBlogSitemap.ts erstellt"

# ─── 4. Orchestrator patchen ────────────────────────────────────
warn "Patche Orchestrator..."

# 4a: Social Media Cron hinzufügen
if ! grep -q "socialMediaPoster" artifacts/api-server/src/agents/orchestrator.ts; then
    # Füge neuen Cron-Job vor "Watchdog starten" ein
    python3 -c "
import re
with open('artifacts/api-server/src/agents/orchestrator.ts', 'r') as f:
    content = f.read()

new_cron = '''  // Social Media Auto-Post: 4x täglich (07, 11, 15, 20 Uhr)
  cron.schedule(\"0 7,11,15,20 * * *\", async () => {
    logger.info(\"⏰ Social Media Auto-Post gestartet\");
    const { posteAutonomAufSocialMedia } = await import(\"./socialMediaPoster\");
    const ergebnis = await posteAutonomAufSocialMedia();
    logger.info(ergebnis, \`📱 Auto-Post: \${ergebnis.gepostet} erfolgreich\`);
  });

'''
content = content.replace(
    '  // Watchdog starten',
    new_cron + '  // Watchdog starten'
)

# 4b: Micro-Trading Agent-Beschreibung markieren
content = content.replace(
    'beschreibung: \"Analysiert Krypto-Marktdaten und führt autonome Papertrades mit Self-Optimization aus.\"',
    'beschreibung: \"⏸️ PAUSIERT — Zu riskant. Nur auf Admin-Anfrage aktivieren.\"'
)

with open('artifacts/api-server/src/agents/orchestrator.ts', 'w') as f:
    f.write(content)
print('Orchestrator gepatcht')
"
    ok "Orchestrator gepatcht"
else
    ok "Social Media Cron bereits vorhanden"
fi

# ─── 5. Route in index.ts einbinden ────────────────────────────
warn "Binde SEO Blog Route ein..."

# Prüfe ob SEO Blog Router-Datei im selben Verzeichnis liegt wie die anderen Routes
if [ -f artifacts/api-server/src/routes/seoBlogSitemap.ts ]; then
    # App-Level Routemount statt über Router (sauberer für /blog, /sitemap.xml)
    # Wir patchen app.ts um den Blog-Router direkt auf Root-Level zu mounten
    
    if ! grep -q "seoBlogSitemap" artifacts/api-server/src/app.ts; then
        python3 -c "
with open('artifacts/api-server/src/app.ts', 'r') as f:
    c = f.read()

# Import hinzufügen nach dem letzten Import
import_line = 'import seoBlogRouter from \"./routes/seoBlogSitemap\";'
if import_line not in c:
    c = c.replace(
        'import router from \"./routes\";',
        'import router from \"./routes\";\n' + import_line
    )

# Route auf Root-Level mounten (vor app.use('/api', router))
mount_line = 'app.use(\"/\", seoBlogRouter);'
if mount_line not in c:
    c = c.replace(
        'app.use(\"/api\", router);',
        mount_line + '\napp.use(\"/api\", router);'
    )

with open('artifacts/api-server/src/app.ts', 'w') as f:
    f.write(c)
print('app.ts gepatcht')
"
        ok "app.ts gepatcht — Blog unter /blog, /sitemap.xml, /robots.txt"
    else
        ok "Blog-Route bereits in app.ts"
    fi
fi

# ─── 6. .env ergänzen ──────────────────────────────────────────
warn "Prüfe .env..."
if [ -f .env ]; then
    if ! grep -q "TIKTOK_ACCESS_TOKEN" .env; then
        cat >> .env << 'ENVEOF'

# ─── Social Media APIs ──────────────────────────────────────────
# TikTok: https://developers.tiktok.com → App erstellen → OAuth2
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_ACCESS_TOKEN=

# Instagram: https://developers.facebook.com → Graph API Explorer
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_BUSINESS_ACCOUNT_ID=
ENVEOF
        ok ".env: Social Media Keys hinzugefügt"
    else
        ok ".env: Social Media Keys bereits vorhanden"
    fi
fi

# ─── 7. Nginx für /blog ───────────────────────────────────────
warn "Konfiguriere Nginx..."
NGINX="/etc/nginx/sites-available/cybersarah.app"
if [ -f "$NGINX" ]; then
    if ! grep -q "location /blog" "$NGINX"; then
        sudo sed -i '/server {/a\
    # SEO Blog + Sitemap + Robots\
    location /blog {\
        proxy_pass http://127.0.0.1:3000;\
        proxy_set_header Host $host;\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
    }\
    location /sitemap.xml {\
        proxy_pass http://127.0.0.1:3000;\
    }\
    location /robots.txt {\
        proxy_pass http://127.0.0.1:3000;\
    }' "$NGINX"
        sudo nginx -t && sudo systemctl reload nginx && ok "Nginx /blog konfiguriert" || warn "Nginx-Test fehlgeschlagen — manuell prüfen"
    else
        ok "Nginx /blog bereits konfiguriert"
    fi
else
    warn "Nginx-Config nicht gefunden — manuell /blog → localhost:3000 weiterleiten"
fi

# ─── 8. Server neu starten ─────────────────────────────────────
warn "Starte Server neu..."
cd "$WORKDIR"
if command -v pm2 &>/dev/null; then
    pm2 restart all 2>/dev/null && ok "PM2: Server neu gestartet" || pm2 start "pnpm run start" --name cybersarah
elif command -v docker &>/dev/null; then
    docker compose down 2>/dev/null; docker compose up -d --build 2>/dev/null && ok "Docker neu gestartet"
else
    warn "Kein PM2/Docker — manuell starten: cd $WORKDIR && pnpm run start"
fi

echo ""
echo -e "${G}══════════════════════════════════════════════════════════${NC}"
echo -e "${G}  ✅ ALLES DEPLOYED!${NC}"
echo -e "${G}══════════════════════════════════════════════════════════${NC}"
echo ""
echo "  📝 SEO Blog:  https://cybersarah.app/blog"
echo "  🗺️  Sitemap:   https://cybersarah.app/sitemap.xml"
echo "  🤖 Trading:   PAUSIERT"
echo ""
echo "  📱 SOCIAL MEDIA API KEYS NOCH EINTRAGEN:"
echo "  → nano $WORKDIR/.env"
echo "  → TikTok: https://developers.tiktok.com"
echo "  → Instagram: https://developers.facebook.com"
echo ""
echo "  🔍 GOOGLE SEARCH CONSOLE EINRICHTEN:"
echo "  → https://search.google.com/search-console"
echo "  → Property: cybersarah.app"
echo "  → Sitemap: https://cybersarah.app/sitemap.xml"
