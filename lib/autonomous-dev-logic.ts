/**
 * CyberSarah Control Center — Autonome Entwicklungs-Logik (Sprint 164)
 *
 * Reine, seiteneffektfreie Kernlogik des autonomen App-/Spiel-Generators:
 * - PLANUNG: spec -> Projektplan mit festen, kostenlosen Ausfuehrungs-
 *   schritten (Template-Scaffold -> optionale LLM-Personalisierung ->
 *   Syntax-/Struktur-Verifikation -> Iteration bis lieferbar).
 * - GENERIERUNG: vollstaendige, abhaengigkeitsfreie Standalone-HTML5-
 *   Artefakte (Canvas-Spiele + Apps mit localStorage). Kein CDN-Zwang,
 *   keine Build-Tools, 0 EUR Betriebskosten.
 * - VERIFIKATION: extractScript() + evaluateArtifact() speisen die
 *   Korrektur-Schleife (max. MAX_FIX_ITERATIONS), die der Server-Agent
 *   autonom durchlaeuft.
 *
 * Die LLM-Personalisierung ist OPTIONAL: ohne Cloud-Key (und ohne
 * lokales Ollama) liefert die Template-Ebene allein ein funktionierendes
 * Ergebnis — damit ist die Entwicklung auch ohne einzige Anbindung
 * vollstaendig autonom und kostenlos.
 */

export type ProjectKind =
  | "pong" | "snake" | "breakout" | "flappy"
  | "todo" | "notes" | "calculator" | "timer"
  | "custom"; // Sprint 166: eigene Idee -> freier LLM-Codegenerator (Stufe 2)

export interface ProjectSpec {
  kind: ProjectKind;
  /** Freitext-Wunsch (fließt in Titel/Untertitel und LLM-Prompt ein). */
  wish?: string;
}

export interface ProjectPlan {
  kind: ProjectKind;
  slug: string;
  label: string;
  steps: string[];
  freeByDesign: true;
  maxFixIterations: number;
}

export interface ArtifactEnhancement {
  title?: string;
  tagline?: string;
  themeColor?: string;
  accentColor?: string;
}

export const MAX_FIX_ITERATIONS = 3;

export const PROJECT_CATALOG: Record<ProjectKind, { label: string; description: string }> = {
  custom: { label: "Custom-Spiel", description: "Eigene Spielidee — freier LLM-Codegenerator (Stufe 2), offline-faehig ueber Template-Fallback." },
  pong: { label: "Pong (Arcade)", description: "Klassisches 2-Spieler-Pong mit Touch/Keyboard-Steuerung." },
  snake: { label: "Snake (Arcade)", description: "Schlange mit Highscore (localStorage), wachsender Schwierigkeit." },
  breakout: { label: "Breakout (Arcade)", description: "Brick-Breaker mit Leben, Level und Punktestand." },
  flappy: { label: "Flappy (Arcade)", description: "Ein-Tap-Flieger mit Rohren, Score und Game-Over-Screen." },
  todo: { label: "To-Do-App", description: "Aufgaben mit Abhaken, Loeschen, Filter und localStorage." },
  notes: { label: "Notiz-App", description: "Autospeichernde Notizen mit Zeichen-Zaehler." },
  calculator: { label: "Taschenrechner", description: "Kettenrechner mit Tastatur- und Button-Eingabe." },
  timer: { label: "Timer/Stoppuhr", description: "Stoppuhr mit Start/Pause/Reset und Zehntelsekunden." },
};

export function isProjectKind(value: string): value is ProjectKind {
  return Object.prototype.hasOwnProperty.call(PROJECT_CATALOG, value);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "projekt";
}

/** Autonomer Projektplan — jeder Schritt ist definitionsgemaess kostenlos. */
export function planProject(spec: ProjectSpec, startedAt = new Date()): ProjectPlan {
  const entry = PROJECT_CATALOG[spec.kind];
  const slug = slugify(`${spec.kind}-${startedAt.toISOString().slice(0, 10)}`);
  return {
    kind: spec.kind,
    slug,
    label: entry.label,
    steps: [
      `Scaffold: ${entry.label} aus der kostenlosen Template-Bibliothek erzeugen`,
      "Personalisierung: freier LLM-Vorschlag (Titel/Farben/Text) — nur wenn ein Gratis-Key oder lokales LLM verfuegbar, sonst Template-Defaults",
      "Verifikation: Inline-Script-Syntax (node --check) + Strukturpruefung",
      "Lieferung: Standalone-HTML ins Workspace-Artefakt-Verzeichnis (0 EUR)",
    ],
    freeByDesign: true,
    maxFixIterations: MAX_FIX_ITERATIONS,
  };
}

// ---------------------------------------------------------------------------
// HTML-Scaffold (gemeinsame Huelle)
// ---------------------------------------------------------------------------

const htmlShell = (enhancement: ArtifactEnhancement, body: string, script: string) => {
  const title = enhancement.title?.trim() || "CyberSarah App";
  const tagline = enhancement.tagline?.trim() || "Autonom entwickelt — vollstaendig kostenlos.";
  const theme = /^#[0-9a-f]{6}$/i.test(enhancement.themeColor ?? "") ? (enhancement.themeColor as string) : "#101828";
  const accent = /^#[0-9a-f]{6}$/i.test(enhancement.accentColor ?? "") ? (enhancement.accentColor as string) : "#22c55e";
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
<title>${title.replace(/[<>]/g, "")}</title>
<style>
  :root { --theme: ${theme}; --accent: ${accent}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: var(--theme); color: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
  .tagline { color: #94a3b8; font-size: 0.85rem; margin-bottom: 1rem; }
  canvas { background: #0b1220; border: 2px solid var(--accent); border-radius: 10px; touch-action: none; }
  .row { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; margin: 0.75rem 0; }
  button { background: var(--accent); color: #04140a; border: 0; border-radius: 8px; padding: 0.55rem 1.1rem; font-size: 1rem; font-weight: 600; cursor: pointer; }
  button.secondary { background: #1e293b; color: #e2e8f0; }
  input, textarea { background: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 8px; padding: 0.55rem 0.75rem; font-size: 1rem; }
  .score { font-size: 1.1rem; font-weight: 700; color: var(--accent); }
  ul { list-style: none; width: min(420px, 92vw); }
  li { display: flex; align-items: center; gap: 0.5rem; background: #1e293b; border-radius: 8px; padding: 0.55rem 0.75rem; margin: 0.35rem 0; }
  li.done span { text-decoration: line-through; color: #64748b; }
  li span { flex: 1; word-break: break-word; }
  footer { margin-top: 1.25rem; color: #64748b; font-size: 0.75rem; }
</style>
</head>
<body>
<h1>${title.replace(/[<>]/g, "")}</h1>
<p class="tagline">${tagline.replace(/[<>]/g, "")}</p>
${body}
<footer>Autonom generiert mit der kostenlosen CyberSarah-Entwicklungskette.</footer>
<script>
${script}
</script>
</body>
</html>`;
};

// ---------------------------------------------------------------------------
// Spiel-/App-Skripte (vanilla JS, abhaengigkeitsfrei)
// ---------------------------------------------------------------------------

const PONG_SCRIPT = `
(function () {
  var cv = document.createElement("canvas");
  cv.width = 640; cv.height = 400;
  document.body.insertBefore(cv, document.querySelector("footer"));
  var ctx = cv.getContext("2d");
  var state = { py: 160, ay: 160, bx: 320, by: 200, vx: 5, vy: 3, ps: 0, as: 0, over: false };
  function reset(dir) { state.bx = 320; state.by = 200; state.vx = 5 * dir; state.vy = (Math.random() * 4) - 2; }
  function step() {
    if (state.over) return;
    state.bx += state.vx; state.by += state.vy;
    if (state.by < 8 || state.by > 392) state.vy *= -1;
    if (state.bx < 24 && state.by > state.py && state.by < state.py + 80) { state.vx = Math.abs(state.vx) + 0.2; state.ps++; }
    if (state.bx > 616 && state.by > state.ay && state.by < state.ay + 80) { state.vx = -(Math.abs(state.vx) + 0.2); state.as++; }
    if (state.bx < -10 || state.bx > 650) { state.over = true; document.getElementById("msg").textContent = "Klick/Taste fuer Neustart"; }
    state.ay += Math.sign(state.by - (state.ay + 40)) * 3.2;
    draw();
  }
  function draw() {
    ctx.clearRect(0, 0, 640, 400);
    ctx.fillStyle = "#22c55e"; ctx.fillRect(10, state.py, 10, 80);
    ctx.fillStyle = "#38bdf8"; ctx.fillRect(620, state.ay, 10, 80);
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(state.bx - 5, state.by - 5, 10, 10);
    document.getElementById("score").textContent = "Du: " + state.ps + "  KI: " + state.as;
  }
  function restart() { state.ps = 0; state.as = 0; state.over = false; state.py = 160; state.ay = 160; reset(1); document.getElementById("msg").textContent = ""; }
  cv.addEventListener("pointermove", function (e) { var r = cv.getBoundingClientRect(); state.py = Math.max(0, Math.min(320, (e.clientY - r.top) * (400 / r.height) - 40)); });
  window.addEventListener("keydown", function (e) { if (e.key === "ArrowUp") state.py = Math.max(0, state.py - 30); if (e.key === "ArrowDown") state.py = Math.min(320, state.py + 30); if (state.over) restart(); });
  cv.addEventListener("click", function () { if (state.over) restart(); });
  var score = document.createElement("div"); score.id = "score"; score.className = "score";
  var msg = document.createElement("div"); msg.id = "msg"; msg.className = "tagline";
  cv.before(score); cv.after(msg);
  setInterval(step, 16);
  draw();
})();`;

const SNAKE_SCRIPT = `
(function () {
  var G = 20, N = 24;
  var cv = document.createElement("canvas");
  cv.width = G * N; cv.height = G * N;
  document.body.insertBefore(cv, document.querySelector("footer"));
  var ctx = cv.getContext("2d");
  var snake, dir, food, score, best, alive, timer;
  best = Number(localStorage.getItem("cybersarah-snake-best") || 0);
  function reset() {
    snake = [{ x: 12, y: 12 }, { x: 11, y: 12 }, { x: 10, y: 12 }];
    dir = { x: 1, y: 0 }; score = 0; alive = true;
    spawnFood();
    document.getElementById("msg").textContent = "";
  }
  function spawnFood() {
    do { food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; }
    while (snake.some(function (s) { return s.x === food.x && s.y === food.y; }));
  }
  function step() {
    if (!alive) return;
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N || snake.some(function (s) { return s.x === head.x && s.y === head.y; })) {
      alive = false;
      if (score > best) { best = score; localStorage.setItem("cybersarah-snake-best", String(best)); }
      document.getElementById("msg").textContent = "Game Over — Taste/Klick fuer Neustart";
      draw(); return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) { score += 10; spawnFood(); } else { snake.pop(); }
    draw();
  }
  function draw() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = "#ef4444"; ctx.fillRect(food.x * G + 2, food.y * G + 2, G - 4, G - 4);
    snake.forEach(function (s, i) { ctx.fillStyle = i === 0 ? "#22c55e" : "#15803d"; ctx.fillRect(s.x * G + 1, s.y * G + 1, G - 2, G - 2); });
    document.getElementById("score").textContent = "Punkte: " + score + "  Best: " + best;
  }
  window.addEventListener("keydown", function (e) {
    var k = e.key;
    if (k === "ArrowUp" && dir.y === 0) dir = { x: 0, y: -1 };
    if (k === "ArrowDown" && dir.y === 0) dir = { x: 0, y: 1 };
    if (k === "ArrowLeft" && dir.x === 0) dir = { x: -1, y: 0 };
    if (k === "ArrowRight" && dir.x === 0) dir = { x: 1, y: 0 };
    if (!alive && (k === " " || k === "Enter")) { reset(); }
  });
  cv.addEventListener("click", function () { if (!alive) reset(); });
  var score = document.createElement("div"); score.id = "score"; score.className = "score";
  var msg = document.createElement("div"); msg.id = "msg"; msg.className = "tagline";
  cv.before(score); cv.after(msg);
  reset();
  timer = setInterval(step, 110);
})();`;

const BREAKOUT_SCRIPT = `
(function () {
  var cv = document.createElement("canvas");
  cv.width = 560; cv.height = 420;
  document.body.insertBefore(cv, document.querySelector("footer"));
  var ctx = cv.getContext("2d");
  var pad = 250, ball, bricks, score, lives, alive;
  function reset() { ball = { x: 280, y: 320, vx: 4, vy: -4 }; bricks = []; for (var r = 0; r < 5; r++) for (var c = 0; c < 10; c++) bricks.push({ x: 18 + c * 53, y: 40 + r * 24, alive: true }); score = 0; lives = 3; alive = true; document.getElementById("msg").textContent = ""; }
  function step() {
    if (!alive) return;
    ball.x += ball.vx; ball.y += ball.vy;
    if (ball.x < 6 || ball.x > 554) ball.vx *= -1;
    if (ball.y < 6) ball.vy *= -1;
    if (ball.y > 404 && ball.x > pad && ball.x < pad + 60) ball.vy = -Math.abs(ball.vy);
    if (ball.y > 420) { lives--; if (lives <= 0) { alive = false; document.getElementById("msg").textContent = "Game Over — Klick/Taste fuer Neustart"; } else { ball = { x: 280, y: 320, vx: 4, vy: -4 }; } }
    bricks.forEach(function (b) {
      if (b.alive && ball.x > b.x && ball.x < b.x + 50 && ball.y > b.y && ball.y < b.y + 18) { b.alive = false; ball.vy *= -1; score += 10; }
    });
    if (bricks.every(function (b) { return !b.alive; })) { alive = false; document.getElementById("msg").textContent = "Gewonnen! Klick fuer Neustart"; }
    draw();
  }
  function draw() {
    ctx.clearRect(0, 0, 560, 420);
    ctx.fillStyle = "#38bdf8"; ctx.fillRect(pad, 400, 60, 10);
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(ball.x - 5, ball.y - 5, 10, 10);
    bricks.forEach(function (b) { if (b.alive) { ctx.fillStyle = "#22c55e"; ctx.fillRect(b.x, b.y, 50, 18); } });
    document.getElementById("score").textContent = "Punkte: " + score + "  Leben: " + lives;
  }
  cv.addEventListener("pointermove", function (e) { var r = cv.getBoundingClientRect(); pad = Math.max(0, Math.min(500, (e.clientX - r.left) * (560 / r.width) - 30)); });
  window.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft") pad = Math.max(0, pad - 30); if (e.key === "ArrowRight") pad = Math.min(500, pad + 30); if (!alive) reset(); });
  cv.addEventListener("click", function () { if (!alive) reset(); });
  var score = document.createElement("div"); score.id = "score"; score.className = "score";
  var msg = document.createElement("div"); msg.id = "msg"; msg.className = "tagline";
  cv.before(score); cv.after(msg);
  reset();
  setInterval(step, 16);
})();`;

const FLAPPY_SCRIPT = `
(function () {
  var cv = document.createElement("canvas");
  cv.width = 360; cv.height = 480;
  document.body.insertBefore(cv, document.querySelector("footer"));
  var ctx = cv.getContext("2d");
  var bird, pipes, score, best, alive, tick;
  best = Number(localStorage.getItem("cybersarah-flappy-best") || 0);
  function reset() { bird = { y: 240, v: 0 }; pipes = []; score = 0; alive = true; document.getElementById("msg").textContent = ""; for (var i = 0; i < 3; i++) pipes.push({ x: 360 + i * 160, gap: 120 + Math.random() * 160 }); }
  function flap() { if (alive) { bird.v = -5.2; } else reset(); }
  function step() {
    if (!alive) return;
    bird.v += 0.28; bird.y += bird.v;
    pipes.forEach(function (p) {
      p.x -= 2.6;
      if (p.x < -60) { p.x = 360; p.gap = 120 + Math.random() * 160; p.scored = false; }
      if (!p.scored && p.x + 60 < 80) { p.scored = true; score++; }
      if (80 + 12 > p.x && 80 - 12 < p.x + 60 && (bird.y - 12 < p.gap || bird.y + 12 > p.gap + 130)) gameOver();
    });
    if (bird.y > 470 || bird.y < 0) gameOver();
    draw();
  }
  function gameOver() {
    alive = false;
    if (score > best) { best = score; localStorage.setItem("cybersarah-flappy-best", String(best)); }
    document.getElementById("msg").textContent = "Game Over — Klick/Taste: Neustart";
  }
  function draw() {
    ctx.clearRect(0, 0, 360, 480);
    ctx.fillStyle = "#22c55e";
    pipes.forEach(function (p) { ctx.fillRect(p.x, 0, 60, p.gap); ctx.fillRect(p.x, p.gap + 130, 60, 480 - p.gap - 130); });
    ctx.fillStyle = "#facc15"; ctx.beginPath(); ctx.arc(80, bird.y, 12, 0, Math.PI * 2); ctx.fill();
    document.getElementById("score").textContent = "Punkte: " + score + "  Best: " + best;
  }
  cv.addEventListener("pointerdown", function (e) { e.preventDefault(); flap(); });
  window.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); flap(); } });
  var score = document.createElement("div"); score.id = "score"; score.className = "score";
  var msg = document.createElement("div"); msg.id = "msg"; msg.className = "tagline";
  cv.before(score); cv.after(msg);
  reset();
  setInterval(step, 16);
})();`;

const TODO_SCRIPT = `
(function () {
  var input = document.getElementById("newItem");
  var list = document.getElementById("list");
  var items = JSON.parse(localStorage.getItem("cybersarah-todo") || "[]");
  var filter = "all";
  function save() { localStorage.setItem("cybersarah-todo", JSON.stringify(items)); }
  function render() {
    list.innerHTML = "";
    items.forEach(function (item, i) {
      if (filter === "open" && item.done) return;
      if (filter === "done" && !item.done) return;
      var li = document.createElement("li");
      if (item.done) li.className = "done";
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = item.done;
      cb.addEventListener("change", function () { items[i].done = cb.checked; save(); render(); });
      var span = document.createElement("span"); span.textContent = item.text;
      var del = document.createElement("button"); del.className = "secondary"; del.textContent = "x";
      del.addEventListener("click", function () { items.splice(i, 1); save(); render(); });
      li.append(cb, span, del); list.appendChild(li);
    });
    document.getElementById("count").textContent = "Offen: " + items.filter(function (x) { return !x.done; }).length;
  }
  document.getElementById("add").addEventListener("click", function () {
    var text = input.value.trim();
    if (!text) return;
    items.push({ text: text, done: false }); input.value = ""; save(); render();
  });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") document.getElementById("add").click(); });
  document.querySelectorAll("[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      filter = btn.getAttribute("data-filter");
      document.querySelectorAll("[data-filter]").forEach(function (b) { b.classList.remove("secondary"); });
      btn.classList.remove("secondary");
      render();
    });
  });
  render();
})();`;

const NOTES_SCRIPT = `
(function () {
  var area = document.getElementById("noteArea");
  area.value = localStorage.getItem("cybersarah-notes") || "";
  var saved = document.getElementById("savedAt");
  function persist() {
    localStorage.setItem("cybersarah-notes", area.value);
    document.getElementById("chars").textContent = area.value.length + " Zeichen";
    saved.textContent = "Automatisch gespeichert: " + new Date().toLocaleTimeString("de-DE");
  }
  area.addEventListener("input", persist);
  document.getElementById("clear").addEventListener("click", function () { area.value = ""; persist(); });
  persist();
})();`;

const CALCULATOR_SCRIPT = `
(function () {
  var display = document.getElementById("display");
  var current = "0", previous = null, op = null, fresh = true;
  function apply(a, b, o) {
    if (o === "+") return a + b;
    if (o === "-") return a - b;
    if (o === "x") return a * b;
    if (o === "/" && b !== 0) return a / b;
    return b;
  }
  function press(key) {
    if (key >= "0" && key <= "9") { current = fresh ? key : (current === "0" ? key : current + key); fresh = false; }
    else if (key === ".") { if (fresh) { current = "0."; fresh = false; } else if (current.indexOf(".") < 0) current += "."; }
    else if (key === "C") { current = "0"; previous = null; op = null; fresh = true; }
    else if (key === "=") {
      if (op !== null && previous !== null) { current = String(apply(previous, Number(current), op)); previous = null; op = null; fresh = true; }
    } else {
      if (op !== null && previous !== null && !fresh) { previous = apply(previous, Number(current), op); current = String(previous); }
      else previous = Number(current);
      op = key; fresh = true;
    }
    display.value = current.length > 16 ? Number(current).toPrecision(10) : current;
  }
  document.querySelectorAll("#pad button").forEach(function (btn) {
    btn.addEventListener("click", function () { press(btn.textContent); });
  });
  window.addEventListener("keydown", function (e) {
    var k = e.key;
    if (k >= "0" && k <= "9") press(k);
    else if (k === ".") press(".");
    else if (k === "+") press("+");
    else if (k === "-") press("-");
    else if (k === "*") press("x");
    else if (k === "/") press("/");
    else if (k === "Enter" || k === "=") { e.preventDefault(); press("="); }
    else if (k === "Escape") press("C");
  });
  press("C");
})();`;

const TIMER_SCRIPT = `
(function () {
  var elapsed = 0, running = false, handle = null;
  var display = document.getElementById("clock");
  function fmt(ms) {
    var t = Math.floor(ms / 100);
    var m = Math.floor(t / 600), s = Math.floor((t % 600) / 10), z = t % 10;
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") + "." + z;
  }
  function render() { display.textContent = fmt(elapsed); }
  document.getElementById("start").addEventListener("click", function () {
    if (running) return;
    running = true;
    var last = Date.now();
    handle = setInterval(function () { var now = Date.now(); elapsed += now - last; last = now; render(); }, 50);
    document.getElementById("start").textContent = "Laeuft…";
  });
  document.getElementById("pause").addEventListener("click", function () {
    running = false; clearInterval(handle);
    document.getElementById("start").textContent = "Weiter";
  });
  document.getElementById("reset").addEventListener("click", function () {
    running = false; clearInterval(handle); elapsed = 0; render();
    document.getElementById("start").textContent = "Start";
  });
  render();
})();`;

// ---------------------------------------------------------------------------
// Artefakt-Bau
// ---------------------------------------------------------------------------

/** Baut das vollstaendige Standalone-HTML-Artefakt fuer einen Projekt-Typ. */
export function buildArtifact(spec: ProjectSpec, enhancement: ArtifactEnhancement = {}): string {
  const defaults: Record<ProjectKind, { title: string; tagline: string }> = {
    pong: { title: "Pong — Du gegen die KI", tagline: "Maus/Touch oder Pfeiltasten. Klick startet neu." },
    snake: { title: "Snake", tagline: "Pfeiltasten steuern — sammle die roten Punkte." },
    breakout: { title: "Breakout", tagline: "Maus/Touch steuert das Paddle. 3 Leben." },
    flappy: { title: "Flappy Sprint", tagline: "Tippen oder Leertaste zum Fliegen." },
    todo: { title: "To-Do", tagline: "Aufgaben erfassen, abhaken, filtern — speichert lokal." },
    notes: { title: "Notizen", tagline: "Schreiben — der Rest speichert sich selbst." },
    calculator: { title: "Taschenrechner", tagline: "Buttons oder Tastatur — Kettenrechnung inklusive." },
    timer: { title: "Stoppuhr", tagline: "Start, Pause, Reset — auf die Zehntelsekunde." },
    custom: { title: "Custom-Spiel", tagline: "Freier LLM-Codegenerator (Stufe 2)." },
  };
  const merged: ArtifactEnhancement = { ...defaults[spec.kind], ...cleanEnhancement(enhancement) };

  switch (spec.kind) {
    case "pong": return htmlShell(merged, "", PONG_SCRIPT);
    case "snake": return htmlShell(merged, "", SNAKE_SCRIPT);
    case "breakout": return htmlShell(merged, "", BREAKOUT_SCRIPT);
    case "flappy": return htmlShell(merged, "", FLAPPY_SCRIPT);
    case "todo": return htmlShell(merged,
      `<div class="row"><input id="newItem" placeholder="Neue Aufgabe…" /><button id="add">+</button></div>
<div class="row"><button data-filter="all">Alle</button><button data-filter="open" class="secondary">Offen</button><button data-filter="done" class="secondary">Erledigt</button></div>
<div id="count" class="score"></div><ul id="list"></ul>`, TODO_SCRIPT);
    case "notes": return htmlShell(merged,
      `<textarea id="noteArea" rows="10" style="width:min(420px,92vw)"></textarea>
<div class="row"><span id="chars"></span><button id="clear" class="secondary">Leeren</button></div>
<div id="savedAt" class="tagline"></div>`, NOTES_SCRIPT);
    case "calculator": return htmlShell(merged,
      `<input id="display" readonly style="width:min(280px,80vw);text-align:right" />
<div id="pad" class="row" style="max-width:280px">
  <button>7</button><button>8</button><button>9</button><button>/</button>
  <button>4</button><button>5</button><button>6</button><button>x</button>
  <button>1</button><button>2</button><button>3</button><button>-</button>
  <button>0</button><button>.</button><button>=</button><button>+</button>
  <button style="width:100%">C</button>
</div>`, CALCULATOR_SCRIPT);
    case "timer": return htmlShell(merged,
      `<div id="clock" class="score" style="font-size:3rem;font-variant-numeric:tabular-nums">00:00.0</div>
<div class="row"><button id="start">Start</button><button id="pause" class="secondary">Pause</button><button id="reset" class="secondary">Reset</button></div>`, TIMER_SCRIPT);
    case "custom":
      // Custom-Spiele laufen ueber die eigene Pipeline (server/custom-game.ts):
      // buildArtifact wird fuer den echten Custom-Fall nie mit kind=custom gerufen.
      throw new Error("CUSTOM_UEBER_EIGENE_PIPELINE: server/custom-game.ts generiert Custom-Spiele.");
  }
}

function cleanEnhancement(enhancement: ArtifactEnhancement): ArtifactEnhancement {
  const out: ArtifactEnhancement = {};
  for (const [key, value] of Object.entries(enhancement)) {
    if (typeof value === "string" && value.trim()) out[key as keyof ArtifactEnhancement] = value.trim().slice(0, 120);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verifikation & Korrektur-Schleife
// ---------------------------------------------------------------------------

/** Extrahiert das Inline-Script des Artefakts (fuer node --check). */
export function extractScript(html: string): string | null {
  const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
  return match ? match[1] : null;
}

export interface ArtifactIssue {
  code: "script_missing" | "script_syntax_error" | "structure_incomplete";
  detail: string;
}

export interface ArtifactVerification {
  ok: boolean;
  issues: ArtifactIssue[];
}

/**
 * Bewertet ein generiertes Artefakt: Syntax-Check-Ergebnis (vom Server
 * via node --check ermittelt) plus Struktur-Garantien (DOCTYPE, Script,
 * Interaktions-Anker). Reine Logik — der Agent iteriert darauf autonom.
 */
export function evaluateArtifact(html: string, scriptSyntaxOk: boolean): ArtifactVerification {
  const issues: ArtifactIssue[] = [];
  if (!extractScript(html)) {
    issues.push({ code: "script_missing", detail: "Kein Inline-<script> im Artefakt gefunden." });
  } else if (!scriptSyntaxOk) {
    issues.push({ code: "script_syntax_error", detail: "Inline-Script besteht den Syntax-Check nicht." });
  }
  if (!html.includes("<!DOCTYPE html>") || !html.includes("</html>")) {
    issues.push({ code: "structure_incomplete", detail: "HTML-Grundstruktur unvollstaendig (DOCTYPE/</html>)." });
  }
  return { ok: issues.length === 0, issues };
}

export type IterationDecision = { action: "deliver" } | { action: "fix"; issues: ArtifactIssue[] } | { action: "abort"; reason: string };

/**
 * Autonome Iterations-Steuerung: bis maxFixIterations wird auf Basis
 * der gefundenen Issues neu generiert (deterministische Templates sind
 * idempotent — ein Fix-Lauf ist ein Neuaufbau mit bereinigten Eingaben);
 * danach ehrlicher Abbruch statt Endlosschleife.
 */
export function nextIteration(
  verification: ArtifactVerification,
  attempt: number,
  maxFixIterations: number = MAX_FIX_ITERATIONS,
): IterationDecision {
  if (verification.ok) return { action: "deliver" };
  if (attempt > maxFixIterations) {
    return { action: "abort", reason: `Verifikation nach ${maxFixIterations} Fix-Iterationen nicht bestanden.` };
  }
  return { action: "fix", issues: verification.issues };
}

/** Prompt fuer die KOSTENLOSE LLM-Personalisierung (nur Deko, nie Logik). */
export function buildEnhancementPrompt(spec: ProjectSpec): string {
  const entry = PROJECT_CATALOG[spec.kind];
  return [
    "Du personalisierst ein fertiges HTML5-Artefakt. Antworte NUR mit JSON:",
    '{"title":"max 40 Zeichen","tagline":"max 80 Zeichen","themeColor":"#RRGGBB","accentColor":"#RRGGBB"}',
    `Projekt: ${entry.label} — ${entry.description}`,
    spec.wish ? `Nutzerwunsch: ${spec.wish.slice(0, 300)}` : "Kein spezieller Wunsch — waehle passenden Namen.",
    "Keine Erklaerungen, kein Markdown, nur das JSON-Objekt.",
  ].join("\n");
}

/** Sicheres Parsen der LLM-Antwort in ein Enhancement-Objekt. */
export function parseEnhancementResponse(raw: string): ArtifactEnhancement {
  try {
    const jsonText = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const enhancement: ArtifactEnhancement = {};
    for (const key of ["title", "tagline", "themeColor", "accentColor"] as const) {
      const value = parsed[key];
      if (typeof value === "string" && value.trim()) enhancement[key] = value.trim();
    }
    return enhancement;
  } catch {
    return {};
  }
}
