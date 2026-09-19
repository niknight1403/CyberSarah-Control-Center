/**
 * Sprint 166 — Custom-Game-Codegenerator & erweiterte Live-Fix-Aktionen
 *
 * Stufe 2 der autonomen Entwicklung: EIGENE Spiele aus einer Idee via
 * freiem LLM, mit Sandbox-Haerte (kein eval, kein Netzwerk, keine
 * externen Ressourcen), autonomer Fix-Schleife und ehrlichem
 * Offline-Fallback auf das naechste Template.
 * Zusaetzlich: Watchdog-Neustart + Cache-Invalidierung als neue
 * risikofreie Live-Fix-Aktionen.
 */

import { describe, expect, it } from "vitest";
import {
  buildCustomGamePrompt,
  buildCustomSlug,
  buildCustomLabel,
  extractGeneratedGame,
  matchTemplateForIdea,
  sanitizeGeneratedGame,
  validateGeneratedGame,
} from "../lib/custom-game-logic";
import {
  applyLiveFix,
  noteIncidentOccurrence,
  planLiveFix,
  resetIncidentOccurrences,
  WATCHDOG_RESTART_THRESHOLD,
} from "../lib/live-fix-logic";

const VALID_GAME = `<!DOCTYPE html>
<html><head><title>Weltraum-Patrouille</title><style>body{margin:0}</style></head>
<body><h1>Weltraum-Patrouille</h1><canvas id="game" width="400" height="300"></canvas>
<script>
(function(){ const c = document.getElementById("game").getContext("2d");
let x = 0; function render(){ c.clearRect(0,0,400,300); c.fillRect(x,100,20,20); x += 2; requestAnimationFrame(render); } render(); })();
</script></body></html>`;

describe("custom-game-logic (Stufe 2, freier LLM-Codegenerator)", () => {
  it("baucht einen Prompt mit harten Vorgaben und der Idee", () => {
    const prompt = buildCustomGamePrompt("Weltraum-Shooter mit Asteroiden");
    expect(prompt).toContain("Weltraum-Shooter mit Asteroiden");
    expect(prompt).toContain("KEINE externen Ressourcen");
    expect(prompt).toContain("```html");
    expect(prompt).toContain("requestAnimationFrame");
  });

  it("extrahiert das HTML aus Fenced-Blocks und Rohantworten", () => {
    expect(extractGeneratedGame(`Erklaerung\n\`\`\`html\n${VALID_GAME}\n\`\`\`\nEnde`)).toContain("<canvas");
    expect(extractGeneratedGame(VALID_GAME)).toContain("<canvas");
    expect(extractGeneratedGame("Nur Text ohne HTML")).toBeNull();
    expect(extractGeneratedGame("")).toBeNull();
  });

  it("lehnt eval/Netzwerk/externe Ressourcen ab und stript entfernbare Tags", () => {
    const { html, issues } = sanitizeGeneratedGame(
      VALID_GAME.replace("</script>", "eval('x'); fetch('http://evil.tld');</script>") +
        '<script src="https://cdn.example.com/lib.js"></script>',
    );
    expect(issues).toContain("eval() ist verboten");
    expect(issues).toContain("fetch() ist verboten (kein Netzwerk)");
    expect(html).not.toContain("cdn.example.com"); // externes <script src> gestrippt
  });

  it("validiert die Spielstruktur ehrlich", () => {
    const clean = sanitizeGeneratedGame(VALID_GAME);
    expect(validateGeneratedGame(clean.html, true, clean.issues).ok).toBe(true);

    const broken = validateGeneratedGame("<html><body>kein Spiel</body></html>", false, []);
    expect(broken.ok).toBe(false);
    expect(broken.issues).toContain("kein <canvas> gefunden");
    expect(broken.issues).toContain("keine requestAnimationFrame-Spiellogik");
  });

  it("mappt Ideen im Offline-Fallback auf das naechste Template", () => {
    expect(matchTemplateForIdea("Snake im Weltraum")?.template).toBe("snake");
    expect(matchTemplateForIdea("Pong gegen die KI")?.template).toBe("pong");
    expect(matchTemplateForIdea("Arkanoid mit Blöcken")?.template).toBe("breakout");
    expect(matchTemplateForIdea("Flappy-Vogel-Klon")?.template).toBe("flappy");
    expect(matchTemplateForIdea("Komplett andere Idee ohne Schluesselwort")).toBeNull();
  });

  it("baut Slug und Label stabile und gekappt", () => {
    expect(buildCustomSlug("Weltraum-Shooter mit Asteroiden!!")).toBe("custom-weltraum-shooter-mit-asteroiden");
    expect(buildCustomSlug("")).toBe("custom-projekt"); // Repo-Slugify-Default
    expect(buildCustomLabel("  kurze   Idee  ")).toBe("Custom-Spiel: kurze Idee");
  });
});

describe("live-fix-logic: erweiterte Watchdog-Aktionen (Sprint 166)", () => {
  it("plant Cache-Invalidierung bei Latenz-/5xx-Signaturen", () => {
    const plan = planLiveFix("api_timeout", "axios timeout 5000ms ueberschritten");
    expect(plan.action).toBe("invalidate_runtime_caches");
    const plan5xx = planLiveFix("http_5xx", "GET /api/trpc 502 Bad Gateway");
    expect(plan5xx.action).toBe("invalidate_runtime_caches");
  });

  it("plant Watchdog-Subsystem-Neustart ab der 3. Wiederholung", () => {
    resetIncidentOccurrences();
    expect(planLiveFix("api_timeout", "timeout", 1).action).toBe("invalidate_runtime_caches");
    expect(planLiveFix("api_timeout", "timeout", 2).action).toBe("invalidate_runtime_caches");
    expect(planLiveFix("api_timeout", "timeout", WATCHDOG_RESTART_THRESHOLD).action).toBe("restart_subsystem");
    resetIncidentOccurrences();
  });

  it("notiert Occurrences im 10-Min-Fenster", () => {
    resetIncidentOccurrences();
    const now = Date.now();
    expect(noteIncidentOccurrence("api_timeout", now)).toBe(1);
    expect(noteIncidentOccurrence("api_timeout", now + 1_000)).toBe(2);
    expect(noteIncidentOccurrence("http_5xx", now + 2_000)).toBe(1);
    expect(noteIncidentOccurrence("api_timeout", now + 1_000 + 10 * 60_000 + 1)).toBe(1); // ausserhalb des Fensters
    resetIncidentOccurrences();
  });

  it("fuehrt die neuen Aktionen aus und bleibt ohne Adapter ehrlich", async () => {
    const cachePlan = planLiveFix("api_timeout", "timeout", 1);
    const cacheOutcome = await applyLiveFix(cachePlan, {
      invalidateRuntimeCaches: () => 3,
    });
    expect(cacheOutcome.applied).toBe(true);
    expect(cacheOutcome.detail).toContain("3 Caches invalidiert");

    const watchdogPlan = planLiveFix("api_timeout", "timeout", WATCHDOG_RESTART_THRESHOLD);
    const watchdogOutcome = await applyLiveFix(watchdogPlan, {
      restartSubsystem: () => true,
    });
    expect(watchdogOutcome.applied).toBe(true);

    // Ohne angemeldete Adapter: ehrliches applied=false, kein Absturz.
    const bare = await applyLiveFix(watchdogPlan, {});
    expect(bare.applied).toBe(false);
    expect(bare.detail).toContain("Kein restartfaehiges");
  });
});
