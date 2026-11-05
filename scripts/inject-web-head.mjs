#!/usr/bin/env node
/**
 * Injiziert den SEO-Kopf in die exportierte Web-index.html.
 *
 * Grund: Expo exportiert mit output:"single" eine generische
 * react-native-web-Vorlage. app/+html.tsx wird dabei NICHT verwendet, die
 * produktive index.html hatte deshalb weder Beschreibung noch Open-Graph-
 * Tags noch canonical, und sie stand auf lang="en". Genau wie die
 * Startup-Shell wird der Kopf darum deterministisch nach dem Export gesetzt.
 *
 * Idempotent: ein zweiter Lauf findet die Markierung und aendert nichts.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const MARKER = "<!-- cs-web-head -->";
const BASE_URL = "https://app.cybersarah-ki.com";
const TITLE = "CyberSarah Control Center — KI-Agenten für Umsatz und Reichweite";
const DESCRIPTION =
  "CyberSarah Control Center: KI-Agenten bauen, betreiben und überwachen Apps und Umsatz-Automatisierungen. Live-Kennzahlen, Freigaben für alles, was nach außen geht.";

export const HEAD_TAGS = [
  { tag: "meta", name: "description", content: DESCRIPTION },
  {
    tag: "meta",
    name: "robots",
    content: "index, follow, max-image-preview:large",
  },
  { tag: "meta", name: "theme-color", content: "#0A0D12" },
  { tag: "meta", name: "color-scheme", content: "dark light" },
  { tag: "link", rel: "canonical", href: `${BASE_URL}/` },
  { tag: "meta", property: "og:type", content: "website" },
  { tag: "meta", property: "og:site_name", content: "CyberSarah Control Center" },
  { tag: "meta", property: "og:locale", content: "de_DE" },
  { tag: "meta", property: "og:url", content: `${BASE_URL}/` },
  { tag: "meta", property: "og:title", content: TITLE },
  { tag: "meta", property: "og:description", content: DESCRIPTION },
  { tag: "meta", property: "og:image", content: `${BASE_URL}/og-image.png` },
  { tag: "meta", property: "og:image:type", content: "image/png" },
  { tag: "meta", property: "og:image:width", content: "1200" },
  { tag: "meta", property: "og:image:height", content: "630" },
  {
    tag: "meta",
    property: "og:image:alt",
    content: "CyberSarah Control Center — KI-Agenten für Umsatz und Reichweite",
  },
  { tag: "meta", name: "twitter:card", content: "summary_large_image" },
  { tag: "meta", name: "twitter:title", content: TITLE },
  {
    tag: "meta",
    name: "twitter:description",
    content: "KI-Agenten bauen, betreiben und überwachen Apps und Umsatz-Automatisierungen.",
  },
  { tag: "meta", name: "twitter:image", content: `${BASE_URL}/og-image.png` },
  {
    tag: "meta",
    name: "twitter:image:alt",
    content: "CyberSarah Control Center — KI-Agenten für Umsatz und Reichweite",
  },
  { tag: "link", rel: "icon", href: "/favicon.ico", sizes: "any" },
  { tag: "link", rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
  { tag: "link", rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
];

export const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "CyberSarah Control Center",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, Android",
  url: `${BASE_URL}/`,
  inLanguage: "de-DE",
  description: DESCRIPTION,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "EUR",
    description: "Kostenloser Einstieg mit Tageslimit; Upgrade und Token-Pakete im Abo.",
  },
};

export function renderHeadTags(tags = HEAD_TAGS, structuredData = STRUCTURED_DATA) {
  const attributes = (tag) => {
    const pairs = [];
    if (tag.property) pairs.push(`property="${tag.property}"`);
    if (tag.name) pairs.push(`name="${tag.name}"`);
    if (tag.content) pairs.push(`content="${tag.content}"`);
    if (tag.rel) pairs.push(`rel="${tag.rel}"`);
    if (tag.href) pairs.push(`href="${tag.href}"`);
    if (tag.type) pairs.push(`type="${tag.type}"`);
    if (tag.sizes) pairs.push(`sizes="${tag.sizes}"`);
    return pairs.join(" ");
  };
  const lines = tags.map((tag) => `    <${tag.tag} ${attributes(tag)} />`);
  lines.push(
    `    <script type="application/ld+json">${JSON.stringify(structuredData)}</script>`,
  );
  return `${MARKER}\n${lines.join("\n")}`;
}

/**
 * Setzt Titel, Sprache und Kopf-Tags in einen index.html-Text.
 * Reine Funktion, damit sie ohne Dateisystem testbar ist.
 */
export function injectWebHead(html, tags = HEAD_TAGS, structuredData = STRUCTURED_DATA) {
  if (html.includes(MARKER)) return { html, changed: false, reason: "bereits injiziert" };
  if (!html.includes("</head>")) return { html, changed: false, reason: "kein </head> gefunden" };

  let next = html
    .replace(/<html\s+lang="[^"]*"/i, '<html lang="de"')
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${TITLE}</title>`)
    .replace("</head>", `${renderHeadTags(tags, structuredData)}\n  </head>`);
  return { html: next, changed: next !== html, reason: "Kopf ersetzt" };
}

function main() {
  const target = process.argv[2] ?? "web-dist";
  const file = path.join(target, "index.html");
  if (!existsSync(file)) {
    console.error(`[web-head] ${file} fehlt — nichts zu tun.`);
    process.exitCode = 1;
    return;
  }
  const before = readFileSync(file, "utf8");
  const result = injectWebHead(before);
  if (!result.changed) {
    console.log(`[web-head] unveraendert (${result.reason}).`);
    return;
  }
  writeFileSync(file, result.html);
  console.log(`[web-head] ${file}: Titel, Sprache und ${HEAD_TAGS.length + 1} Kopf-Eintraege gesetzt.`);
}

if (process.argv[1] && process.argv[1].endsWith("inject-web-head.mjs")) main();
