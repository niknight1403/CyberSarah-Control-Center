import { ScrollViewStyleReset } from "expo-router/html";
import type { ReactNode } from "react";

/**
 * Web-Startshell: wird inline vor dem Expo-Bundle gerendert und verhindert
 * einen weißen Bildschirm während Download, React-Mount und erster Queries.
 * React entfernt sie unmittelbar nach dem erfolgreichen Mount.
 *
 * Sprint 160: Farben liegen als CSS-Variablen vor (Default = Neon Pulse) und
 * werden von THEME_PRECOLOR_SCRIPT VOR dem ersten Paint synchron anhand des
 * lokal gespeicherten Design-Themes ueberschrieben — die Shell zeigt so
 * bereits die richtige Palette, statt kurz auf Pulse zu blitzen und dann
 * umzuspringen. Die vier Farbwerte sind bewusst minimal (Hintergrund + zwei
 * Glow-Toene) und muessen bei neuen Themes in DESIGN_THEME_PRECOLORS unten
 * UND in lib/_core/design-theme-palettes.ts (dark-Palette) gepflegt werden.
 */
const STARTUP_SHELL = `
<style id="cs-startup-style">
  :root {
    --cs-startup-bg: #0A0D12;
    --cs-startup-glow-a: rgba(25,230,255,.25);
    --cs-startup-glow-b: rgba(139,124,255,.18);
    --cs-startup-border: rgba(25,230,255,.48);
    --cs-startup-accent-from: #52D8FF;
    --cs-startup-accent-to: #45D996;
  }
  html, body { margin: 0; min-height: 100%; background: var(--cs-startup-bg); }
  #cs-startup-shell { position: fixed; inset: 0; z-index: 2147483646; display: grid; place-items: center; overflow: hidden; color: #F2F6FC; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at 20% 10%, var(--cs-startup-glow-a), transparent 38%), radial-gradient(circle at 85% 85%, var(--cs-startup-glow-b), transparent 42%), var(--cs-startup-bg); transition: opacity .18s ease; }
  #cs-startup-shell::before { content: ""; position: absolute; width: 42vmax; height: 42vmax; border: 1px solid var(--cs-startup-border); border-radius: 50%; box-shadow: 0 0 80px var(--cs-startup-glow-a), inset 0 0 80px var(--cs-startup-glow-b); animation: cs-pulse 2.4s ease-in-out infinite; }
  .cs-startup-card { position: relative; width: min(420px, calc(100vw - 48px)); padding: 28px 30px; box-sizing: border-box; border: 1px solid var(--cs-startup-border); border-radius: 24px; background: rgba(7,27,42,.84); box-shadow: 0 0 34px var(--cs-startup-glow-a), 0 18px 60px rgba(0,0,0,.28); text-align: center; backdrop-filter: blur(14px); }
  .cs-startup-mark { display: inline-grid; place-items: center; width: 52px; height: 52px; margin-bottom: 16px; border-radius: 16px; color: #0A0D12; font-size: 25px; font-weight: 800; background: linear-gradient(135deg, var(--cs-startup-accent-from), var(--cs-startup-accent-to)); box-shadow: 0 0 26px var(--cs-startup-glow-a); }
  .cs-startup-title { margin: 0; font-size: 22px; letter-spacing: -.02em; }
  .cs-startup-copy { margin: 8px 0 20px; color: #A9C1D8; font-size: 13px; }
  .cs-startup-track { height: 4px; overflow: hidden; border-radius: 99px; background: rgba(169,193,216,.18); }
  .cs-startup-track::after { content: ""; display: block; width: 42%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--cs-startup-accent-from), var(--cs-startup-accent-to)); animation: cs-loading 1.2s ease-in-out infinite; }
  @keyframes cs-loading { 0% { transform: translateX(-120%); } 100% { transform: translateX(300%); } }
  @keyframes cs-pulse { 0%, 100% { transform: scale(.92); opacity: .55; } 50% { transform: scale(1.04); opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
</style>
<script>
  (function () {
    // Sprint 160: synchron VOR dem ersten Paint ausgefuehrt (kein DOMContentLoaded-
    // Warten) — liest den rohen localStorage-Key von AsyncStorage (Web nutzt
    // localStorage ohne Praefix) und faerbt die Startup-Shell direkt in der
    // zuletzt gewaehlten Design-Palette statt im Pulse-Default.
    var PRECOLORS = {
      pulse: { bg: '#0A0D12', glowA: 'rgba(82,216,255,.25)', glowB: 'rgba(139,124,255,.18)', border: 'rgba(82,216,255,.48)', from: '#52D8FF', to: '#45D996' },
      orbit: { bg: '#080D24', glowA: 'rgba(139,92,255,.28)', glowB: 'rgba(25,230,255,.18)', border: 'rgba(139,92,255,.5)', from: '#8B5CFF', to: '#19E6FF' },
      synthwave: { bg: '#170A20', glowA: 'rgba(255,79,216,.28)', glowB: 'rgba(255,146,64,.18)', border: 'rgba(255,79,216,.5)', from: '#FF4FD8', to: '#FF9240' },
      minimal: { bg: '#061513', glowA: 'rgba(0,245,212,.22)', glowB: 'rgba(0,245,155,.15)', border: 'rgba(0,245,212,.45)', from: '#00F5D4', to: '#00F59B' }
    };
    try {
      var stored = window.localStorage.getItem('cybersarah.design-theme.v5');
      var theme = PRECOLORS[stored] ? stored : 'pulse';
      var c = PRECOLORS[theme];
      var root = document.documentElement.style;
      root.setProperty('--cs-startup-bg', c.bg);
      root.setProperty('--cs-startup-glow-a', c.glowA);
      root.setProperty('--cs-startup-glow-b', c.glowB);
      root.setProperty('--cs-startup-border', c.border);
      root.setProperty('--cs-startup-accent-from', c.from);
      root.setProperty('--cs-startup-accent-to', c.to);
    } catch (e) {
      // localStorage nicht verfuegbar (privater Modus o.ae.) -> Pulse-Default aus dem Style-Block bleibt aktiv.
    }
  })();
</script>
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
    // BUGFIX (Sprint 210): show() erzeugt ein permanentes, vollflaechiges
    // weisses Overlay (z-index max) OHNE Entfernungslogik. Im Erfolgsfall
    // durfte dieses Overlay NIE erscheinen — vorher legte es sich nach 8s
    // ausnahmslos ueber die fertig gemountete App und blockte die gesamte UI
    // dauerhaft (weisser Screen mit nur den 3 Diagnosezeilen). Jetzt: bei
    // erfolgreichem Mount NUR still in die Konsole loggen, kein Overlay.
    // Das Overlay bleibt ausschliesslich echten Problemen vorbehalten
    // (Mount-Timeout, [FEHLER], [REJECTION]).
    if(!window.__csMounted){
      show('[DIAG] React hat nach 8s NICHT gemountet.');
      show('[DIAG] WebView/UA: ' + navigator.userAgent);
      show('[DIAG] Origin: ' + (window.location && window.location.href));
    } else {
      try { console.log('[CSDIAG] React gemountet OK. UA=' + navigator.userAgent + ' Origin=' + (window.location && window.location.href)); } catch(e){}
    }
  }, 8000);
})();`;

export default function Root({ children }: { children?: ReactNode }) {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* Share-Vorschau und Suchergebnis: absolute URLs, damit WhatsApp,
            LinkedIn und X ein Bild statt eines nackten Links zeigen. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>CyberSarah Control Center — KI-Agenten für Umsatz und Reichweite</title>
        <meta
          name="description"
          content="CyberSarah Control Center: KI-Agenten bauen, betreiben und überwachen Apps und Umsatz-Automatisierungen. Live-Kennzahlen, Freigaben für alles, was nach außen geht."
        />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <meta name="theme-color" content="#0A0D12" />
        <meta name="color-scheme" content="dark light" />
        <link rel="canonical" href="https://app.cybersarah-ki.com/" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="CyberSarah Control Center" />
        <meta property="og:locale" content="de_DE" />
        <meta property="og:url" content="https://app.cybersarah-ki.com/" />
        <meta property="og:title" content="CyberSarah Control Center — KI-Agenten für Umsatz und Reichweite" />
        <meta
          property="og:description"
          content="KI-Agenten bauen, betreiben und überwachen Apps und Umsatz-Automatisierungen. Live-Kennzahlen, Freigaben für alles, was nach außen geht."
        />
        {/* Das Bild liegt in public/ und wird mit dem Web-Export ausgeliefert.
            Vorher zeigte og:image auf /assets/assets/images/icon.png — dieser
            Pfad antwortete mit 404, jede geteilte Vorschau blieb ohne Bild. */}
        <meta property="og:image" content="https://app.cybersarah-ki.com/og-image.png" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="CyberSarah Control Center — KI-Agenten für Umsatz und Reichweite" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="CyberSarah Control Center — KI-Agenten für Umsatz und Reichweite" />
        <meta
          name="twitter:description"
          content="KI-Agenten bauen, betreiben und überwachen Apps und Umsatz-Automatisierungen."
        />
        <meta name="twitter:image" content="https://app.cybersarah-ki.com/og-image.png" />
        <meta name="twitter:image:alt" content="CyberSarah Control Center — KI-Agenten für Umsatz und Reichweite" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "CyberSarah Control Center",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web, Android",
              url: "https://app.cybersarah-ki.com/",
              inLanguage: "de-DE",
              description:
                "KI-Agenten bauen, betreiben und überwachen Apps und Umsatz-Automatisierungen. Live-Kennzahlen, Freigaben für alles, was nach außen geht.",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "EUR",
                description: "Kostenloser Einstieg mit Tageslimit; Upgrade und Token-Pakete im Abo.",
              },
            }),
          }}
        />
        <ScrollViewStyleReset />
        <div dangerouslySetInnerHTML={{ __html: STARTUP_SHELL }} />
        <script dangerouslySetInnerHTML={{ __html: DIAG_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
