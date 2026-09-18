#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outputDir = process.argv[2] || "web-dist";
if (!existsSync(outputDir)) throw new Error(`Web-Export-Verzeichnis fehlt: ${outputDir}`);

const shell = `
<style id="cs-startup-style">
html,body{margin:0;min-height:100%;background:#03111D}
#cs-startup-shell{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;overflow:hidden;color:#F4F8FF;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 20% 10%,rgba(25,230,255,.25),transparent 38%),radial-gradient(circle at 85% 85%,rgba(240,45,255,.18),transparent 42%),#03111D;transition:opacity .18s ease}
#cs-startup-shell:before{content:"";position:absolute;width:42vmax;height:42vmax;border:1px solid rgba(25,230,255,.18);border-radius:50%;box-shadow:0 0 80px rgba(25,230,255,.12),inset 0 0 80px rgba(240,45,255,.08);animation:cs-pulse 2.4s ease-in-out infinite}
.cs-startup-card{position:relative;width:min(420px,calc(100vw - 48px));padding:28px 30px;box-sizing:border-box;border:1px solid rgba(25,230,255,.48);border-radius:24px;background:rgba(7,27,42,.84);box-shadow:0 0 34px rgba(25,230,255,.16),0 18px 60px rgba(0,0,0,.28);text-align:center;backdrop-filter:blur(14px)}
.cs-startup-mark{display:inline-grid;place-items:center;width:52px;height:52px;margin-bottom:16px;border-radius:16px;color:#03111D;font-size:25px;font-weight:800;background:linear-gradient(135deg,#19E6FF,#00F59B);box-shadow:0 0 26px rgba(25,230,255,.45)}
.cs-startup-title{margin:0;font-size:22px;letter-spacing:-.02em}.cs-startup-copy{margin:8px 0 20px;color:#A9C1D8;font-size:13px}.cs-startup-track{height:4px;overflow:hidden;border-radius:99px;background:rgba(169,193,216,.18)}.cs-startup-track:after{content:"";display:block;width:42%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#19E6FF,#F02DFF);animation:cs-loading 1.2s ease-in-out infinite}@keyframes cs-loading{0%{transform:translateX(-120%)}100%{transform:translateX(300%)}}@keyframes cs-pulse{0%,100%{transform:scale(.92);opacity:.55}50%{transform:scale(1.04);opacity:1}}@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;animation-iteration-count:1!important}}
</style>
<div id="cs-startup-shell" role="status" aria-live="polite"><div class="cs-startup-card"><div class="cs-startup-mark">✦</div><h1 class="cs-startup-title">CyberSarah Control Center</h1><p class="cs-startup-copy">Sichere Steuerzentrale wird geladen …</p><div class="cs-startup-track" aria-hidden="true"></div></div></div>
<script>window.__csHideStartupShell=function(){var e=document.getElementById('cs-startup-shell');if(!e)return;e.style.opacity='0';setTimeout(function(){if(e.parentNode)e.parentNode.removeChild(e)},220)};</script>`;

function inject(filePath) {
  const html = readFileSync(filePath, "utf8");
  if (html.includes("id=\"cs-startup-shell\"")) return false;
  if (!/<body[^>]*>/i.test(html)) return false;
  writeFileSync(filePath, html.replace(/(<body[^>]*>)/i, `$1${shell}`));
  return true;
}

const htmlFiles = readdirSync(outputDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
  .map((entry) => join(outputDir, entry.name));
let injected = 0;
for (const filePath of htmlFiles) if (inject(filePath)) injected += 1;
console.log(`[web-shell] injected into ${injected} HTML file(s) in ${outputDir}`);
