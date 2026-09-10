import { ScrollViewStyleReset } from "expo-router/html";
import type { ReactNode } from "react";

/**
 * Sprint 73 DIAGNOSE-Build: Custom-HTML-Geruest fuer den Expo-Web-Export.
 *
 * Der native WebView-Wrapper zeigt bei JS-Fehlern nur einen weissen Screen.
 * Dieses Inline-Skript (bewusst ES5, laeuft VOR dem App-Bundle) faengt
 * Parse-Fehler, Laufzeitfehler und unhandled Rejections ab und zeigt sie
 * als Vollbild-Overlay an. Ausserdem wird nach 8s geprueft, ob React
 * überhaupt gemountet hat (Flag __csMounted aus app/_layout.tsx) und
 * der WebView-UserAgent angezeigt — damit wir im Zweifelsfall die
 * WebView-Version sehen.
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
    show('[FEHLER] ' + (e.message || 'Unbekannter Fehler') +
      (e.filename ? ('\\n  @ ' + e.filename + ':' + e.lineno + ':' + e.colno) : '') +
      (e.error && e.error.stack ? ('\\n' + e.error.stack) : ''));
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    show('[REJECTION] ' + ((r && (r.message || r) || r) + '') +
      (r && r.stack ? ('\\n' + r.stack) : ''));
  });
  setTimeout(function(){
    if(!window.__csMounted){
      show('[DIAG] React hat nach 8s NICHT gemountet.');
    } else {
      show('[DIAG] React gemountet OK.');
    }
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
        <script dangerouslySetInnerHTML={{ __html: DIAG_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
