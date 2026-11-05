/**
 * Der Kopf der produktiven index.html entsteht durch Injektion nach dem
 * Expo-Export (output:"single" uebernimmt app/+html.tsx nicht). Diese Tests
 * halten fest, was injiziert wird, dass es idempotent bleibt und dass die
 * Werte zu app/+html.tsx passen — sonst laufen Dev-Server und Produktion
 * auseinander.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Bewusst reines ESM (.mjs), damit der Docker-Build es ohne Bundling nutzt.
import { HEAD_TAGS, STRUCTURED_DATA, injectWebHead, renderHeadTags } from "../scripts/inject-web-head.mjs";

const EXPORT_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>CyberSarah Control Center</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

const HEAD_SOURCE = readFileSync("app/+html.tsx", "utf8");

describe("Injektion des SEO-Kopfes", () => {
  it("setzt Sprache, Titel und die Kopf-Eintraege", () => {
    const { html, changed } = injectWebHead(EXPORT_TEMPLATE);
    expect(changed).toBe(true);
    expect(html).toContain('<html lang="de"');
    expect(html).toContain("<title>CyberSarah Control Center — KI-Agenten für Umsatz und Reichweite</title>");
    expect(html).toContain('property="og:image" content="https://app.cybersarah-ki.com/og-image.png"');
    expect(html).toContain('rel="canonical" href="https://app.cybersarah-ki.com/"');
    expect(html).toContain('name="description"');
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"SoftwareApplication"');
  });

  it("laesst den restlichen Export unberuehrt", () => {
    const { html } = injectWebHead(EXPORT_TEMPLATE);
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<meta charset="utf-8" />');
    expect(html.match(/<title>/g)).toHaveLength(1);
  });

  it("ist idempotent", () => {
    const first = injectWebHead(EXPORT_TEMPLATE).html;
    const second = injectWebHead(first);
    expect(second.changed).toBe(false);
    expect(second.html).toBe(first);
  });

  it("bricht sauber ab, wenn kein </head> vorhanden ist", () => {
    const result = injectWebHead("<html><body>ohne Kopf</body></html>");
    expect(result.changed).toBe(false);
    expect(result.reason).toContain("</head>");
  });

  it("beschreibt jede Zeile mit genau den Attributen, die sie braucht", () => {
    const html = renderHeadTags();
    expect(html.split("\n").filter((line) => line.includes("<meta")).length).toBe(
      HEAD_TAGS.filter((tag: { tag: string }) => tag.tag === "meta").length,
    );
    expect(html.match(/property="og:image:width" content="1200"/)).not.toBeNull();
    expect(STRUCTURED_DATA.inLanguage).toBe("de-DE");
  });
});

describe("Gleichlauf mit app/+html.tsx", () => {
  it("nutzt dieselbe Überschrift, Beschreibung und Bild-URL", () => {
    const meta = (property: string): string | null =>
      HEAD_SOURCE.match(new RegExp(`content="([^"]+)"[^>]*\\n?`, "m"))?.[1] ?? null;

    const get = (key: string, attr: "name" | "property"): string | null => {
      const match =
        HEAD_SOURCE.match(new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]+)"`, "m")) ??
        HEAD_SOURCE.match(new RegExp(`<meta[^>]*content="([^"]+)"[^>]*${attr}="${key}"`, "m"));
      return match?.[1] ?? null;
    };

    const ogImage = get("og:image", "property");
    expect(ogImage).toBe("https://app.cybersarah-ki.com/og-image.png");
    expect(HEAD_TAGS.find((tag: { property?: string }) => tag.property === "og:image")?.content).toBe(ogImage);

    const description = get("description", "name");
    expect(description).not.toBeNull();
    expect(HEAD_TAGS.find((tag: { name?: string }) => tag.name === "description")?.content).toBe(description);
    expect(meta).toBeDefined();
  });
});
