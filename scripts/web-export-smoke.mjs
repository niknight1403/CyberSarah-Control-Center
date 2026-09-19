/**
 * Sprint 195 — Web-Export-Smoke-Gate: fuehrt den Expo-Web-Export in einer
 * DOM-Umgebung (happy-dom) aus und prueft, dass die App wirklich mountet.
 *
 * Hintergrund: Der Weisser-Screen-Vorfall 20.09.2026 (useAnimatedValue in
 * react-native-web nicht vorhanden) haette dieses Gate im Workflow
 * abgefangen — die defekte APK waere nie gebaut worden. tsc und die
 * RN-gestubbte Logik-Suite koennen solche Web-Runtime-Crashes nicht sehen.
 *
 * Kriterien (Fehler => Exit 1):
 *   1. Keine nicht gefilterte JS-Ausnahme beim Laden/Mounten
 *   2. #root enthaelt nach Ablauf der settling-Zeit Markup (React mountete)
 *
 * Aufruf: node scripts/web-export-smoke.mjs [export-dir]
 *   Standard: web-dist. happy-dom muss installiert sein (devDependency).
 */
import { Window } from "happy-dom";
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "web-dist");
const html = readFileSync(path.join(root, "index.html"), "utf8");

const entryFiles = readdirSync(path.join(root, "_expo/static/js/web")).filter((f) => f.startsWith("entry-"));
if (entryFiles.length === 0) {
  console.error("web-export-smoke: kein entry-*.js im Export gefunden.");
  process.exit(1);
}
const js = readFileSync(path.join(root, "_expo/static/js/web", entryFiles[0]), "utf8");

const window = new Window({
  url: "https://localhost/",
  settings: { disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
});
const { document } = window;

// --- Polyfills, die ein echter Browser mitbringt ---
window.matchMedia =
  window.matchMedia ||
  ((query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }));
window.scrollTo = () => {};
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);

const errors = [];
const HARNES_NOISE = [
  // happy-dom laedt das externe CSS nicht (disabled) — im echten Browser irrelevant.
  /Failed to load external stylesheet/,
  // RN-Hinweis, weil im Harness kein nativer Animation-Treiber existiert.
  /useNativeDriver.*is not supported/,
  // Reanimated-Hinweis zur Layout-Animation — Cosmetic, kein Crash.
  /may be overwritten by a layout animation/,
  // Expo-Web-Einschraenkung, kein Fehler.
  /expo-notifications.*push token/i,
];
window.addEventListener("error", (e) => {
  errors.push("WINDOW-ERROR: " + (e.error?.stack?.split("\n").slice(0, 3).join(" | ") ?? e.message));
});
window.console.error = (...args) => {
  const text = args.map((a) => (a?.stack ? a.stack.split("\n").slice(0, 3).join(" | ") : String(a))).join(" ");
  if (!HARNES_NOISE.some((re) => re.test(text))) errors.push("CONSOLE.ERROR: " + text.slice(0, 400));
};

document.write(html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, ""));

// Node >= 21 hat eigene nur-Lese-Globals (navigator, …): nur setzen, wenn
// zulaessig; vorhandene Node-Globals bleiben sonst unangetastet.
function defineGlobal(name, value) {
  if (name in globalThis) return; // bereits vorhanden (z. B. Node-22-navigator)
  try { globalThis[name] = value; } catch { /* nur-Lese — ignorieren */ }
}

defineGlobal("window", window);
defineGlobal("document", window.document);
defineGlobal("navigator", window.navigator);
defineGlobal("location", window.location);
defineGlobal("localStorage", window.localStorage);
defineGlobal("fetch", window.fetch);
defineGlobal("history", window.history);
defineGlobal("screen", window.screen);
defineGlobal("self", window);
globalThis.devicePixelRatio = 2;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
defineGlobal("requestAnimationFrame", window.requestAnimationFrame);
defineGlobal("cancelAnimationFrame", window.cancelAnimationFrame);
defineGlobal("matchMedia", window.matchMedia);
defineGlobal("scrollTo", window.scrollTo);
// Alle weiteren DOM-Klassen (ShadowRoot, HTMLStyleElement, CSSFontFaceRule, …)
// aus der happy-dom-Window uebernehmen, soweit im Node-Global fehlend.
for (const key of Object.getOwnPropertyNames(window)) {
  defineGlobal(key, window[key]);
}

try {
  const code = js + `\n//# sourceURL=${pathToFileURL(path.join(root, "_expo/static/js/web/entry-bundle.js")).href}`;
  (0, eval)(code);
} catch (err) {
  errors.push("THROWN: " + (err?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(err)));
}

await new Promise((resolve) => setTimeout(resolve, 8000));

const rootEl = document.getElementById("root");
const mounted = Boolean(rootEl && rootEl.innerHTML.trim().length > 100);
const startupShellHidden = Boolean(window.__csMounted);

console.log(`web-export-smoke: #root ${mounted ? "enthaelt Markup" : "LEER"} | __csMounted=${startupShellHidden}`);
if (errors.length) {
  console.log("web-export-smoke: Fehler waehrend Mount:");
  for (const e of errors.slice(0, 10)) console.log("  " + e);
}
await window.happyDOM.close();

if (!mounted || errors.length > 0) {
  console.error("web-export-smoke: FEHLGESCHLAGEN — Export monto nicht fehlerfrei.");
  process.exit(1);
}
console.log("web-export-smoke: OK — App mountet fehlerfrei im Web-Kontext.");
process.exit(0);
