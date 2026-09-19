#!/usr/bin/env node
/**
 * Sprint 195 — Startup-Shell- und Diagnose-Injection in den Web-Export.
 *
 * Hintergrund: app/+html.tsx wird von Expo Router NUR bei static Rendering
 * (output: "static") angewendet. Das Control Center baut mit output: "single"
 * (Sprint 73, Hydration-Fix) — dort ist +html.tsx WIRKUNGSLOS: Der Export
 * hatte keine Lade-Shell und kein Diagnose-Overlay. Folge war der
 * Weisser-Screen-Vorfall 20.09.2026: Die APK zeigte bei einem JS-Crash
 * rein Weiss — keinerlei Diagnose auf dem Geraet.
 *
 * Dieses Skript injiziert nach dem Expo-Export die Shell (STARTUP_SHELL)
 * und das Inline-Diagnose-Overlay (DIAG_SCRIPT) direkt in die exportierte
 * index.html. Quelle der beiden Bloecke ist app/+html.tsx (single source of
 * truth) — es wird nichts dupliziert.
 *
 * Aufruf: node scripts/inject-startup-shell.mjs [web-dist-dir]
 *   Standard-Verzeichnis: web-dist
 * Exit-Code 1, wenn Muster nicht gefunden oder die Datei unveraenderlich ist.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const exportDir = process.argv[2] ?? "web-dist";
const indexPath = path.join(exportDir, "index.html");

// --- STARTUP_SHELL und DIAG_SCRIPT aus app/+html.tsx extrahieren ---
const htmlModulePath = path.resolve(process.cwd(), "app/+html.tsx");
const htmlModule = readFileSync(htmlModulePath, "utf8");

function extractTemplateLiteral(name) {
  const match = htmlModule.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`));
  if (!match) {
    console.error(`inject-startup-shell: '${name}' nicht in app/+html.tsx gefunden — Abbruch.`);
    process.exit(1);
  }
  return match[1];
}

const startupShell = extractTemplateLiteral("STARTUP_SHELL");
const diagScript = extractTemplateLiteral("DIAG_SCRIPT");

// --- index.html lesen und patchen ---
let html = readFileSync(indexPath, "utf8");
const patched = html
  .replace(/<body>/, `<body>\n${startupShell}`)
  .replace(/<\/body>/, `<script>${diagScript}</script>\n</body>`);

if (patched === html) {
  console.error("inject-startup-shell: index.html-Platzhalter (<body>/</body>) nicht gefunden — Abbruch.");
  process.exit(1);
}

writeFileSync(indexPath, patched);
console.log(`inject-startup-shell: Shell + Diagnose in ${indexPath} injiziert.`);
