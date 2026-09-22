import { Router } from "express";
import {
  generiereSeoArtikel,
  ladeSeoUebersicht,
  ladeArtikelPerSlug,
  pausiereArtikel,
  reaktiviereArtikel,
} from "../agents/seoContentAgent";

const router = Router();

// GET /seo/uebersicht — alle Artikel + Statistiken
router.get("/seo/uebersicht", async (req, res) => {
  try {
    const daten = await ladeSeoUebersicht();
    res.json(daten);
  } catch (err) {
    req.log.error({ err }, "Fehler beim Laden der SEO-Übersicht");
    res.status(500).json({ error: "Fehler beim Laden" });
  }
});

// POST /seo/scan — neue Keyword-Ideen generieren + Artikel veröffentlichen
router.post("/seo/scan", async (req, res) => {
  try {
    const ergebnis = await generiereSeoArtikel();
    res.json(ergebnis);
  } catch (err) {
    req.log.error({ err }, "Fehler beim SEO-Scan");
    res.status(500).json({ error: "Scan fehlgeschlagen", details: err instanceof Error ? err.message : String(err) });
  }
});

// POST /seo/:id/pausieren
router.post("/seo/:id/pausieren", async (req, res) => {
  const id = parseInt(req.params.id ?? "", 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }
  try {
    await pausiereArtikel(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Pausieren" });
  }
});

// POST /seo/:id/reaktivieren
router.post("/seo/:id/reaktivieren", async (req, res) => {
  const id = parseInt(req.params.id ?? "", 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Ungültige ID" });
    return;
  }
  try {
    await reaktiviereArtikel(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Fehler beim Reaktivieren" });
  }
});

// GET /seo/artikel/:slug — öffentliche, crawlbare HTML-Artikelseite (echtes SEO-Asset)
router.get("/seo/artikel/:slug", async (req, res) => {
  try {
    const artikel = await ladeArtikelPerSlug(req.params.slug ?? "");
    if (!artikel || artikel.status !== "veroeffentlicht") {
      res.status(404).send("<h1>Artikel nicht gefunden</h1>");
      return;
    }

    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const bodyHtml = escape(artikel.body)
      .split("\n\n")
      .map(absatz => {
        if (absatz.startsWith("## ")) return `<h2>${absatz.replace(/^## /, "")}</h2>`;
        if (absatz.startsWith("### ")) return `<h3>${absatz.replace(/^### /, "")}</h3>`;
        return `<p>${absatz.replace(/\n/g, "<br/>")}</p>`;
      })
      .join("\n");

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>${escape(artikel.titel)}</title>
<meta name="description" content="${escape(artikel.metaDescription ?? "")}" />
<meta name="robots" content="index, follow" />
</head>
<body>
<article>
<h1>${escape(artikel.titel)}</h1>
${bodyHtml}
</article>
</body>
</html>`);
  } catch (err) {
    req.log.error({ err }, "Fehler beim Laden des Artikels");
    res.status(500).send("<h1>Fehler</h1>");
  }
});

export default router;
