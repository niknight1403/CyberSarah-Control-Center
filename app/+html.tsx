import { ScrollViewStyleReset } from "expo-router/html";
import type { ReactNode } from "react";

/**
 * Web-Startshell: wird inline vor dem Expo-Bundle gerendert und verhindert
 * einen weißen Bildschirm während Download, React-Mount und erster Queries.
 * React entfernt sie unmittelbar nach dem erfolgreichen Mount.
 */
const STARTUP_SHELL = `
<style id="cs-startup-style">
  html, body { margin: 0; min-height: 100%; background: #0A0D12; }
  #cs-startup-shell { position: fixed; inset: 0; z-index: 2147483646; display: grid; place-items: center; overflow: hidden; color: #F2F6FC; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at 20% 10%, rgba(82,216,255,.25), transparent 38%), radial-gradient(circle at 85% 85%, rgba(139,124,255,.18), transparent 42%), #0A0D12; transition: opacity .18s ease; }
  #cs-startup-shell::before { content: ""; position: absolute; width: 42vmax; height: 42vmax; border: 1px solid rgba(25,230,255,.18); border-radius: 50%; box-shadow: 0 0 80px rgba(25,230,255,.12), inset 0 0 80px rgba(240,45,255,.08); animation: cs-pulse 2.4s ease-in-out infinite; }
  .cs-startup-card { position: relative; width: min(420px, calc(100vw - 48px)); padding: 28px 30px; box-sizing: border-box; border: 1px solid rgba(25,230,255,.48); border-radius: 24px; background: rgba(7,27,42,.84); box-shadow: 0 0 34px rgba(25,230,255,.16), 0 18px 60px rgba(0,0,0,.28); text-align: center; backdrop-filter: blur(14px); }
  .cs-startup-mark { display: inline-grid; place-items: center; width: 52px; height: 52px; margin-bottom: 16px; border-radius: 16px; color: #0A0D12; font-size: 25px; font-weight: 800; background: linear-gradient(135deg, #52D8FF, #45D996); box-shadow: 0 0 26px rgba(82,216,255,.45); }
  .cs-startup-title { margin: 0; font-size: 22px; letter-spacing: -.02em; }
  .cs-startup-copy { margin: 8px 0 20px; color: #A9C1D8; font-size: 13px; }
  .cs-startup-track { height: 4px; overflow: hidden; border-radius: 99px; background: rgba(169,193,216,.18); }
  .cs-startup-track::after { content: ""; display: block; width: 42%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #52D8FF, #8B7CFF); animation: cs-loading 1.2s ease-in-out infinite; }
  @keyframes cs-loading { 0% { transform: translateX(-120%); } 100% { transform: translateX(300%); } }
  @keyframes cs-pulse { 0%, 100% { transform: scale(.92); opacity: .55; } 50% { transform: scale(1.04); opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
</style>
<div id="cs-startup-shell" role="status" aria-live="polite">
  <div class="cs-startup-card">
    <div class="cs-startup-mark">✦</div>
    <h1 class="cs-startup-title">CyberSarah Control Center</h1>
    <p class="cs-startup-copy">Sichere Steuerzentrale wird geladen …</p>
    <div class="cs-startup-track" aria-hidden="true"></div>
  </div>
</div>
<script>
  window.__csHideStartupShell = function () {
    var shell = document.getElementById('cs-startup-shell');
    if (!shell) return;
    shell.style.opacity = '0';
    setTimeout(function () { if (shell.parentNode) shell.parentNode.removeChild(shell); }, 220);
  };
</script>`;

/**
 * Inline-Diagnose bleibt aktiv: Fehler werden sichtbar statt als weiße Seite
 * verschluckt, ohne den normalen Startpfad zu blockieren.
 */
const DIAG_SCRIPT = `(function(){
  function ensureOverlay(){
    var d = document.getElementById('csdiag');
    if(!d){
      d = document.createElement('pre');
      d.id = 'csdiag';
      d.style.cssText = 'position:fixed;z-index:2147483647;left:0;right:0;top:0;bottom:0;overflow:auto;background:#fff;color:#b00;font:11px/1.45 monospace;padding:12px;margin:0;white-space:pre-wrap;word-break:break-all';
      (document.body || document.documentElement).appendChild(d);
    }
    return d;
  }
  function show(msg){
    try { ensureOverlay().textContent += msg + '\\n'; } catch(e){}
    try { console.log('[CSDIAG] ' + msg); } catch(e){}
  }
  window.__csShowDiag = show;
  window.addEventListener('error', function(e){
    show('[FEHLER] ' + (e.message || 'Unbekannter Fehler') + (e.filename ? ('\\n  @ ' + e.filename + ':' + e.lineno + ':' + e.colno) : '') + (e.error && e.error.stack ? ('\\n' + e.error.stack) : ''));
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    show('[REJECTION] ' + ((r && (r.message || r) || r) + '') + (r && r.stack ? ('\\n' + r.stack) : ''));
  });
  setTimeout(function(){
    if(!window.__csMounted){ show('[DIAG] React hat nach 8s NICHT gemountet.'); }
    else { show('[DIAG] React gemountet OK.'); }
    show('[DIAG] WebView/UA: ' + navigator.userAgent);
    show('[DIAG] Origin: ' + (window.location && window.location.href));
  }, 8000);
})();`;

export default function Root({ children }: { children?: ReactNode }) {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <ScrollViewStyleReset />
        <div dangerouslySetInnerHTML={{ __html: STARTUP_SHELL }} />
        <script dangerouslySetInnerHTML={{ __html: DIAG_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
