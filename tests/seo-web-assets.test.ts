/**
 * Regression fuer die Web-Vorschau und die Crawler-Dateien.
 *
 * Anlass: das og:image der Seite zeigte live auf einen Pfad, der mit 404
 * antwortete. Jede geteilte Vorschau (WhatsApp, LinkedIn, X) blieb damit ohne
 * Bild. Diese Pruefung haelt die Tags, die Dateien und ihre Abmessungen
 * zusammen, damit ein Pfadwechsel nicht wieder unbemerkt ins Leere zeigt.
 */
import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const HEAD = readFileSync("app/+html.tsx", "utf8");

const metaContent = (source: string, property: string): string | null => {
  const pattern = new RegExp(
    `<meta\\s+(?:property|name)="${property}"\\s+content="([^"]+)"`,
    "m",
  );
  return source.match(pattern)?.[1] ?? null;
};

describe("Web-Vorschau (Open Graph, Twitter, Icons)", () => {
  it("verweist beim og:image auf die ausgelieferte Datei", () => {
    expect(metaContent(HEAD, "og:image")).toBe("https://app.cybersarah-ki.com/og-image.png");
    expect(existsSync("public/og-image.png")).toBe(true);
  });

  it("nennt die Abmessungen, damit Netzwerke die grosse Karte zeigen", () => {
    expect(metaContent(HEAD, "og:image:width")).toBe("1200");
    expect(metaContent(HEAD, "og:image:height")).toBe("630");
    expect(metaContent(HEAD, "og:image:type")).toBe("image/png");
  });

  it("zeigt das og:image auch bei Twitter mit Alternativtext", () => {
    expect(metaContent(HEAD, "twitter:image")).toBe("https://app.cybersarah-ki.com/og-image.png");
    expect(metaContent(HEAD, "twitter:image:alt")).toContain("CyberSarah Control Center");
  });

  it("verweist nur auf Icons, die es im Web-Export gibt", () => {
    const icons = [...HEAD.matchAll(/rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(icons.length).toBeGreaterThan(0);
    for (const href of icons) {
      expect(href.startsWith("/")).toBe(true);
      expect(existsSync(`public${href}`), `fehlende Datei: public${href}`).toBe(true);
    }
  });

  it("beschreibt die Anwendung als strukturierte Daten", () => {
    expect(HEAD).toContain('"@type": "SoftwareApplication"');
    expect(HEAD).toContain("https://app.cybersarah-ki.com/");
  });

  it("laesst Suchmaschinen indexieren", () => {
    expect(metaContent(HEAD, "robots")).toContain("index");
    expect(HEAD).toContain('rel="canonical"');
  });
});

describe("Crawler-Dateien", () => {
  it("robots.txt nennt die Sitemap und sperrt die API", () => {
    const robots = readFileSync("public/robots.txt", "utf8");
    expect(robots).toContain("Sitemap: https://app.cybersarah-ki.com/sitemap.xml");
    expect(robots).toContain("Disallow: /api/");
    expect(robots).toContain("Allow: /");
  });

  it("sitemap.xml ist wohlgeformt und enthaelt die Startseite", () => {
    const sitemap = readFileSync("public/sitemap.xml", "utf8");
    expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(sitemap).toContain("<urlset");
    expect(sitemap).toContain("<loc>https://app.cybersarah-ki.com/</loc>");
    expect(sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/)).not.toBeNull();
  });
});
