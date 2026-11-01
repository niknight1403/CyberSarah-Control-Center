/**
 * SEO Blog Routes — Öffentlich crawlbare Blog-Seiten für cybersarah.app
 * 
 * Fügt hinzu:
 * - /blog                    → Blog-Übersicht (alle Artikel)
 * - /blog/:slug              → Einzelner Artikel (SEO-optimiert)
 * - /sitemap.xml             → XML-Sitemap für Google
 * - /robots.txt              → Robots-Datei
 * 
 * Integration: In routes/index.ts als app.use("/api", seoBlogRouter) einbinden.
 * Nginx: /blog/* → localhost:3000/api/blog/* weiterleiten.
 */
import { Router } from "express";
import { chatWidgetHtml } from "../lib/chatWidget";
import { newsletterWidgetHtml } from "../lib/newsletterWidget";
import { systemStatusBadgeHtml } from "../lib/systemWidget";
import { db } from "@workspace/db";
import { seoContentTable, produkteTable } from "@workspace/db";
import { eq, desc, and, gte, sql } from "drizzle-orm";

const router = Router();
const PUBLIC_APP_URL = process.env["PUBLIC_APP_URL"] ?? "https://cybersarah.app";

// ─── HTML-Template für Blog-Seiten ──────────────────────────────────────────

function renderBlogLayout(options: {
  title: string;
  description: string;
  canonicalUrl: string;
  bodyHtml: string;
  noIndex?: boolean;
}): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(options.title)}</title>
<meta name="description" content="${escape(options.description)}" />
<link rel="canonical" href="${options.canonicalUrl}" />
${options.noIndex ? '<meta name="robots" content="noindex, nofollow" />' : '<meta name="robots" content="index, follow" />'}
<meta property="og:title" content="${escape(options.title)}" />
<meta property="og:description" content="${escape(options.description)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${options.canonicalUrl}" />
<meta name="twitter:card" content="summary_large_image" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e0e0e0; line-height: 1.7; }
  .container { max-width: 800px; margin: 0 auto; padding: 2rem 1.5rem; }
  .header { background: linear-gradient(135deg, #1a0a2e, #0d0d1a); padding: 3rem 0; text-align: center; border-bottom: 1px solid #2a1a4e; }
  .header h1 { font-size: 2.2rem; background: linear-gradient(90deg, #a855f7, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .header p { color: #9ca3af; margin-top: 0.5rem; font-size: 1.1rem; }
  .nav { padding: 1rem 0; border-bottom: 1px solid #1f1f2e; text-align: center; }
  .nav a { color: #a855f7; text-decoration: none; margin: 0 1rem; font-weight: 500; }
  .nav a:hover { color: #06b6d4; }
  article { padding: 2rem 0; }
  article h1 { font-size: 1.8rem; margin-bottom: 1rem; color: #f0f0f0; }
  article h2 { font-size: 1.4rem; margin: 2rem 0 0.8rem; color: #c084fc; border-left: 3px solid #a855f7; padding-left: 0.8rem; }
  article h3 { font-size: 1.15rem; margin: 1.5rem 0 0.5rem; color: #06b6d4; }
  article p { margin-bottom: 1rem; }
  article a { color: #a855f7; }
  .blog-list { display: grid; gap: 1.5rem; padding: 2rem 0; }
  .blog-card { background: #111118; border: 1px solid #1f1f2e; border-radius: 12px; padding: 1.5rem; transition: border-color 0.2s; }
  .blog-card:hover { border-color: #a855f7; }
  .blog-card h2 { font-size: 1.2rem; margin-bottom: 0.5rem; }
  .blog-card h2 a { color: #f0f0f0; text-decoration: none; }
  .blog-card h2 a:hover { color: #a855f7; }
  .blog-card .meta { color: #6b7280; font-size: 0.85rem; margin-bottom: 0.5rem; }
  .blog-card .excerpt { color: #9ca3af; font-size: 0.95rem; }
  .cta-box { background: linear-gradient(135deg, #1a0a2e, #0d1a2e); border: 1px solid #2a1a4e; border-radius: 12px; padding: 2rem; margin: 2rem 0; text-align: center; }
  .cta-box h3 { color: #a855f7; margin-bottom: 0.8rem; }
  .cta-btn { display: inline-block; background: linear-gradient(90deg, #a855f7, #06b6d4); color: #fff; padding: 0.8rem 2rem; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 1rem; }
  footer { border-top: 1px solid #1f1f2e; padding: 2rem 0; text-align: center; color: #6b7280; font-size: 0.85rem; }
</style>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-XXXXXXX');</script>
</head>
<body>
<div class="header">
  <div class="container">
    <h1>CyberSarah Blog</h1>
    <p>KI-Tools, Automatisierung & Online-Geldverdienen</p>
  </div>
</div>
<div class="nav">
  <a href="/blog">Blog</a>
  <a href="/blog?marke=CyberSarah">CyberSarah</a>
  <a href="/blog?marke=GeldPilot AI">GeldPilot AI</a>
  <a href="/blog?marke=UnternehmerGPT">UnternehmerGPT</a>
</div>
<div class="container">
${options.bodyHtml}
</div>
<footer>
  <div class="container">
    &copy; ${new Date().getFullYear()} CyberSarah Revenue OS &middot; KI-gestützte Automatisierung
  </div>
</footer>
${systemStatusBadgeHtml()}${newsletterWidgetHtml()}${chatWidgetHtml()}
</body>
</html>`;
}

// ─── Blog-Übersicht ─────────────────────────────────────────────────────────

router.get("/blog", async (req, res) => {
  try {
    const marke = req.query["marke"] as string | undefined;
    const conditions = [eq(seoContentTable.status, "veroeffentlicht")];
    if (marke) conditions.push(eq(seoContentTable.marke, marke));

    const artikel = await db
      .select()
      .from(seoContentTable)
      .where(and(...conditions))
      .orderBy(desc(seoContentTable.veroeffentlichtAm))
      .limit(50);

    const cardsHtml = artikel
      .map((a) => {
        const datum = a.veroeffentlichtAm
          ? new Date(a.veroeffentlichtAm).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })
          : "";
        const excerpt = (a.metaDescription ?? a.body ?? "").slice(0, 160);
        return `<div class="blog-card">
  <div class="meta">${a.marke} &middot; ${datum}</div>
  <h2><a href="/blog/${a.slug}">${a.titel}</a></h2>
  <p class="excerpt">${excerpt}...</p>
</div>`;
      })
      .join("\n");

    const bodyHtml = cardsHtml.length > 0
      ? `<h2 style="color:#a855f7; margin: 1.5rem 0;">Neueste Artikel</h2>\n<div class="blog-list">${cardsHtml}</div>`
      : '<p style="text-align:center; color:#6b7280; padding: 3rem 0;">Noch keine Artikel vorhanden. Die KI-Agenten arbeiten daran!</p>';

    const title = marke ? `Blog — ${marke}` : "Blog — KI & Automatisierung";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderBlogLayout({
      title,
      description: "Aktuelle Artikel zu KI-Tools, Automatisierung und Online-Geldverdienen",
      canonicalUrl: `${PUBLIC_APP_URL}/blog`,
      bodyHtml,
    }));
  } catch (err) {
    req.log.error({ err }, "Fehler beim Blog-Laden");
    res.status(500).send("<h1>Fehler</h1>");
  }
});

// ─── Einzelner Artikel ──────────────────────────────────────────────────────

router.get("/blog/:slug", async (req, res) => {
  try {
    const [artikel] = await db
      .select()
      .from(seoContentTable)
      .where(and(
        eq(seoContentTable.slug, req.params["slug"] ?? ""),
        eq(seoContentTable.status, "veroeffentlicht"),
      ))
      .limit(1);

    if (!artikel) {
      res.status(404).send(renderBlogLayout({
        title: "Artikel nicht gefunden — CyberSarah Blog",
        description: "Der gesuchte Artikel existiert nicht.",
        canonicalUrl: `${PUBLIC_APP_URL}/blog`,
        bodyHtml: '<p style="text-align:center; padding: 3rem 0;">Artikel nicht gefunden.</p>',
        noIndex: true,
      }));
      return;
    }

    // Aufrufe zählen
    await db
      .update(seoContentTable)
      .set({ aufrufe: artikel.aufrufe + 1 })
      .where(eq(seoContentTable.id, artikel.id));

    // Markdown-ähnlichen Body zu HTML konvertieren
    const escape = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // Lesezeit berechnen
    const wortAnzahl = (artikel.body ?? "").split(/\s+/).filter(Boolean).length;
    const lesezeitMin = Math.max(1, Math.ceil(wortAnzahl / 200));
    const lesezeitText = lesezeitMin <= 1 ? "1 Minute Lesezeit" : `${lesezeitMin} Minuten Lesezeit`;

    const bodyHtml = (artikel.body ?? "")
      .split("\n\n")
      .map((absatz) => {
        if (absatz.startsWith("## ")) return `<h2>${escape(absatz.replace(/^## /, ""))}</h2>`;
        if (absatz.startsWith("### ")) return `<h3>${escape(absatz.replace(/^### /, ""))}</h3>`;
        if (absatz.startsWith("**") && absatz.endsWith("**")) {
          return `<p><strong>${escape(absatz.replace(/\*\*/g, ""))}</strong></p>`;
        }
        if (absatz.startsWith("---")) return '<hr style="border-color: #1f1f2e; margin: 2rem 0;">';
        // Links erkennen
        const mitLinks = escape(absatz).replace(
          /\[([^\]]+)\]\(([^)]+)\)/g,
          '<a href="$2" target="_blank" rel="noopener">$1</a>',
        );
        return `<p>${mitLinks.replace(/\n/g, "<br/>")}</p>`;
      })
      .join("\n");

    // CTA Box wenn Produkt verlinkt
    const ctaHtml = artikel.produktId
      ? `<div class="cta-box">
  <h3>🚀 Bereit loszulegen?</h3>
  <p>Dieser Artikel ist Teil unseres CyberSarah Revenue OS — dem autonomen KI-System für Online-Umsatz.</p>
  <a href="${PUBLIC_APP_URL}" class="cta-btn">Jetzt starten</a>
</div>`
      : "";

    const datum = artikel.veroeffentlichtAm
      ? new Date(artikel.veroeffentlichtAm).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })
      : "";

    const fullBody = `<article>
  <div style="color:#6b7280; font-size: 0.9rem; margin-bottom: 1rem;">${artikel.marke} &middot; ${datum} &middot; ${artikel.aufrufe + 1} Aufrufe &middot; ${lesezeitText}</div>
  <h1>${escape(artikel.titel)}</h1>
  <!-- Social Sharing Buttons -->
  <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-bottom:1.5rem;">
    <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(artikel.titel ?? "")}&url=${encodeURIComponent(`${PUBLIC_APP_URL}/blog/${artikel.slug}`)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.4rem;background:#1f1f2e;color:#e5e7eb;padding:0.45rem 1rem;border-radius:8px;text-decoration:none;font-size:0.8rem;border:1px solid #2a2a3e;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      <span>X</span>
    </a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${PUBLIC_APP_URL}/blog/${artikel.slug}`)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.4rem;background:#1f1f2e;color:#e5e7eb;padding:0.45rem 1rem;border-radius:8px;text-decoration:none;font-size:0.8rem;border:1px solid #2a2a3e;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      <span>Facebook</span>
    </a>
    <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${PUBLIC_APP_URL}/blog/${artikel.slug}`)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.4rem;background:#1f1f2e;color:#e5e7eb;padding:0.45rem 1rem;border-radius:8px;text-decoration:none;font-size:0.8rem;border:1px solid #2a2a3e;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#0a66c2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
      <span>LinkedIn</span>
    </a>
    <a href="https://api.whatsapp.com/send?text=${encodeURIComponent(`${artikel.titel} - ${PUBLIC_APP_URL}/blog/${artikel.slug}`)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:0.4rem;background:#1f1f2e;color:#e5e7eb;padding:0.45rem 1rem;border-radius:8px;text-decoration:none;font-size:0.8rem;border:1px solid #2a2a3e;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.48-8.413z"/></svg>
      <span>WhatsApp</span>
    </a>
  </div>
  ${bodyHtml}
</article>
${ctaHtml}`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderBlogLayout({
      title: `${artikel.titel} — CyberSarah Blog`,
      description: artikel.metaDescription ?? artikel.titel,
      canonicalUrl: `${PUBLIC_APP_URL}/blog/${artikel.slug}`,
      bodyHtml: fullBody,
    }));
  } catch (err) {
    req.log.error({ err }, "Fehler beim Artikel-Laden");
    res.status(500).send("<h1>Fehler</h1>");
  }
});

// ─── XML-Sitemap ────────────────────────────────────────────────────────────

router.get("/sitemap.xml", async (_req, res) => {
  try {
    const artikel = await db
      .select({ slug: seoContentTable.slug, veroeffentlichtAm: seoContentTable.veroeffentlichtAm })
      .from(seoContentTable)
      .where(eq(seoContentTable.status, "veroeffentlicht"))
      .orderBy(desc(seoContentTable.veroeffentlichtAm));

    const urls = artikel
      .map((a) => {
        const lastmod = a.veroeffentlichtAm
          ? new Date(a.veroeffentlichtAm).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];
        return `  <url>
    <loc>${PUBLIC_APP_URL}/blog/${a.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
      })
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${PUBLIC_APP_URL}/blog</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${PUBLIC_APP_URL}</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${urls}
</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.send(xml);
  } catch (err) {
    res.status(500).send("<?xml version='1.0'?><error/>");
  }
});


// ─── RSS Feed ──────────────────────────────────────────────────────────────

router.get("/feed.xml", async (_req, res) => {
  try {
    const artikel = await db
      .select({ slug: seoContentTable.slug, titel: seoContentTable.titel, metaDescription: seoContentTable.metaDescription, marke: seoContentTable.marke, veroeffentlichtAm: seoContentTable.veroeffentlichtAm })
      .from(seoContentTable)
      .where(eq(seoContentTable.status, "veroeffentlicht"))
      .orderBy(desc(seoContentTable.veroeffentlichtAm))
      .limit(50);

    const items = artikel.map(a => {
      const datum = a.veroeffentlichtAm ? new Date(a.veroeffentlichtAm).toUTCString() : new Date().toUTCString();
      return `  <item>
    <title><![CDATA[${a.titel}]]></title>
    <link>${PUBLIC_APP_URL}/blog/${a.slug}</link>
    <guid>${PUBLIC_APP_URL}/blog/${a.slug}</guid>
    <pubDate>${datum}</pubDate>
    <description><![CDATA[${a.metaDescription ?? a.titel}]]></description>
    <dc:creator><![CDATA[${a.marke}]]></dc:creator>
  </item>`;
    }).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>CyberSarah Blog</title>
    <link>${PUBLIC_APP_URL}</link>
    <description>KI-Tools, Automatisierung & Online-Geldverdienen — autonom generiert vom CyberSarah Revenue OS</description>
    <language>de</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.send(xml);
  } catch {
    res.status(500).send("<?xml version='1.0'?><error/>");
  }
});
// ─── Robots.txt ─────────────────────────────────────────────────────────────

router.get("/robots.txt", (_req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(`User-agent: *
Allow: /blog
Allow: /sitemap.xml
Disallow: /api/
Disallow: /settings

Sitemap: ${PUBLIC_APP_URL}/sitemap.xml
`);
});

// ─── JSON-LD Structured Data für Google Rich Results ─────────────────────────

router.get("/blog/:slug/structured", async (req, res) => {
  try {
    const [artikel] = await db
      .select()
      .from(seoContentTable)
      .where(and(
        eq(seoContentTable.slug, req.params["slug"] ?? ""),
        eq(seoContentTable.status, "veroeffentlicht"),
      ))
      .limit(1);

    if (!artikel) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: artikel.titel,
      description: artikel.metaDescription,
      author: { "@type": "Organization", name: artikel.marke },
      publisher: { "@type": "Organization", name: "CyberSarah" },
      url: `${PUBLIC_APP_URL}/blog/${artikel.slug}`,
      datePublished: artikel.veroeffentlichtAm?.toISOString(),
      mainEntityOfPage: `${PUBLIC_APP_URL}/blog/${artikel.slug}`,
    };

    res.json(structuredData);
  } catch {
    res.status(500).json({ error: "Fehler" });
  }
});

export default router;
