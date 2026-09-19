/**
 * Sprint 164 — Autonome Entwicklung & Live-Fix: Logik-Tests
 *
 * Deckt die harten Garantien ab:
 * - Zero-Cost-Stack: jede aktive Ressource ist kostenlos oder lokal;
 *   bezahlte Endpoints werden nie ausgewaehlt.
 * - Alle 8 Templates erzeugen vollstaendige, syntaktisch gueltige
 *   Standalone-Artefakte (node --check auf das echte Inline-Script).
 * - Verifikations-/Iterations-Logik: deliver/fix/abort ehrlich.
 * - Live-Fix: Signatur->Aktion-Mapping, Provider-Quarantaene, Ausfuehrung.
 */

import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { resolveFreeStack } from "../lib/free-dev-stack";
import {
  buildArtifact,
  buildEnhancementPrompt,
  evaluateArtifact,
  extractScript,
  isProjectKind,
  nextIteration,
  parseEnhancementResponse,
  planProject,
  PROJECT_CATALOG,
  slugify,
  type ProjectKind,
} from "../lib/autonomous-dev-logic";
import {
  applyLiveFix,
  getProviderQuarantineSnapshot,
  isProviderQuarantined,
  planLiveFix,
  quarantineProvider,
} from "../lib/live-fix-logic";

const KINDS = Object.keys(PROJECT_CATALOG) as ProjectKind[];

describe("free-dev-stack (Zero-Cost-Garantie)", () => {
  it("waehlt mit Groq-Key den kostenlosen Gratis-Endpoint", () => {
    const stack = resolveFreeStack({ groqApiKey: "gsk_test" });
    expect(stack.activeLlm?.id).toBe("groq");
    expect(stack.activeLlm?.free).toBe(true);
    expect(stack.zeroCost).toBe(true);
  });

  it("waehlt NIE einen bezahlten Endpoint — die Entwicklung bleibt 0 EUR", () => {
    const stack = resolveFreeStack({ openaiApiKey: "sk-only-paid" });
    expect(stack.activeLlm).toBeNull(); // Bezahlter Endpoint wird NIE ausgewaehlt
    expect(stack.zeroCost).toBe(false); // Ehrlicher Stack-Nachweis: Chat waere bezahlt
    expect(stack.zeroCostDetail).toContain("0 EUR");
  });

  it("bleibt ohne jeden Cloud-Key vollstaendig autonom (lokale LLMs aktiv)", () => {
    const stack = resolveFreeStack({});
    expect(stack.activeLlm).toBeNull();
    expect(stack.zeroCost).toBe(true);
    expect(stack.localLlms.map((entry) => entry.id)).toContain("ollama");
    expect(stack.localLlms.map((entry) => entry.id)).toContain("lmstudio");
  });

  it("dokumentiert alle kostenlosen Werkzeuge, Anbindungen und Assets", () => {
    const stack = resolveFreeStack({});
    const ids = [...stack.devTools, ...stack.connectors, ...stack.assets].map((e) => e.id);
    for (const expected of ["tsc", "vitest", "node-check", "github-api", "duckduckgo", "inline-svg"]) {
      expect(ids).toContain(expected);
    }
    expect([...stack.devTools, ...stack.connectors, ...stack.assets].every((e) => e.free)).toBe(true);
  });
});

describe("autonome Entwicklungs-Logik (Templates + Verifikation)", () => {
  it("kennt alle Projektarten", () => {
    for (const kind of KINDS) expect(isProjectKind(kind)).toBe(true);
    expect(isProjectKind("tetris-3d")).toBe(false);
  });

  it("plant jedes Projekt vollstaendig kostenlos mit Fix-Schleifen-Grenze", () => {
    for (const kind of KINDS) {
      const plan = planProject({ kind }, new Date("2026-09-19T09:00:00Z"));
      expect(plan.freeByDesign).toBe(true);
      expect(plan.steps.length).toBeGreaterThanOrEqual(4);
      expect(plan.maxFixIterations).toBeGreaterThan(0);
      expect(plan.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("erzeugt fuer jede Art ein vollstaendiges Standalone-HTML", () => {
    for (const kind of KINDS) {
      const html = buildArtifact({ kind });
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("</html>");
      expect(extractScript(html)).toBeTruthy();
    }
  });

  it("besteht node --check: alle Inline-Scripts sind syntaktisch gueltig", () => {
    for (const kind of KINDS) {
      const script = extractScript(buildArtifact({ kind }));
      expect(script).toBeTruthy();
      const tmp = join(tmpdir(), `autonomous-test-${kind}-${Date.now()}.js`);
      writeFileSync(tmp, script as string, "utf-8");
      try {
        execFileSync("node", ["--check", tmp], { stdio: "pipe" });
      } finally {
        rmSync(tmp, { force: true });
      }
    }
  });

  it("baut Enhancements sauber ein und filtert unsichere Eingaben", () => {
    const html = buildArtifact({ kind: "snake" }, { title: "Meine <b>Boa</b>", themeColor: "#00ff88", accentColor: "javascript:alert(1)" });
    expect(html).toContain("Meine bBoa/b"); // Spitzklammern werden aus Deko-Text entfernt (XSS-Schutz)
    expect(html).toContain("#00ff88");
    expect(html).toContain("#22c55e"); // Ungueltige accentColor faellt auf den Default
  });

  it("verifiziert ehrlich: fehlendes Script und kappte Struktur werden erkannt", () => {
    const ok = evaluateArtifact("<!DOCTYPE html><html><script>var a = 1;</script></html>", true);
    expect(ok.ok).toBe(true);

    const noScript = evaluateArtifact("<!DOCTYPE html><html></html>", true);
    expect(noScript.ok).toBe(false);
    expect(noScript.issues.map((i) => i.code)).toContain("script_missing");

    const badSyntax = evaluateArtifact("<!DOCTYPE html><html><script>var a = ;</script></html>", false);
    expect(badSyntax.ok).toBe(false);
    expect(badSyntax.issues.map((i) => i.code)).toContain("script_syntax_error");

    const brokenStructure = evaluateArtifact("<script>var a = 1;</script>", true);
    expect(brokenStructure.ok).toBe(false);
  });

  it("steuert die autonome Fix-Schleife: deliver, fix, abort", () => {
    expect(nextIteration({ ok: true, issues: [] }, 1).action).toBe("deliver");
    const fixDecision = nextIteration({ ok: false, issues: [{ code: "script_syntax_error", detail: "x" }] }, 1, 3);
    expect(fixDecision.action).toBe("fix");
    const abortDecision = nextIteration({ ok: false, issues: [{ code: "script_syntax_error", detail: "x" }] }, 4, 3);
    expect(abortDecision.action).toBe("abort");
  });

  it("baut den kostenlosen LLM-Personalisierungs-Prompt und parst die Antwort robust", () => {
    const prompt = buildEnhancementPrompt({ kind: "pong", wish: "Neon-Style" });
    expect(prompt).toContain("Pong");
    expect(prompt).toContain("Neon-Style");
    expect(prompt).toContain("JSON");

    expect(parseEnhancementResponse('{"title":"Neon Pong","themeColor":"#00e5ff"}')).toEqual({
      title: "Neon Pong",
      themeColor: "#00e5ff",
    });
    expect(parseEnhancementResponse("kein json")).toEqual({});
    expect(parseEnhancementResponse('{"title": 42}')).toEqual({});
  });

  it("slugify erzeugt sichere Verzeichnisnamen", () => {
    expect(slugify("Flappy Sprint — Ünicode!")).toBe("flappy-sprint-uenicode");
    expect(slugify("///")).toBe("projekt");
  });
});

describe("live-fix-logic (direkte Live-Behebung)", () => {
  it("mappt Limit-Fehler sofort auf Provider-Quarantaene", () => {
    const plan = planLiveFix("http_5xx", "Groq 429 Too Many Requests — rate limit exceeded");
    expect(plan.action).toBe("quarantine_provider");
    expect(plan.provider).toBe("groq");
  });

  it("mappt DB-Stoerung auf Backup-Waechter-Reset und OOM auf Log-Purge", () => {
    expect(planLiveFix("db_connection", "connection refused").action).toBe("restart_backup_watcher");
    expect(planLiveFix("out_of_memory", "heap OOM").action).toBe("purge_log_buffer");
    expect(planLiveFix("stack_trace", "TypeError: x is not a function").action).toBe("none");
  });

  it("quarantaeneiert Provider fuer 60s und gibt sie danach automatisch frei", () => {
    quarantineProvider("groq", 1_000);
    expect(isProviderQuarantined("groq")).toBe(true);
    expect(isProviderQuarantined("gemini")).toBe(false);
    const later = Date.now() + 1_001;
    expect(isProviderQuarantined("groq", later)).toBe(false);
    expect(getProviderQuarantineSnapshot().length).toBe(0);
  });

  it("fuehrt Live-Fixes sofort und risikofrei aus", async () => {
    const restarts: string[] = [];
    const outcome = await applyLiveFix(
      { action: "restart_backup_watcher", reason: "DB-Stoerung" },
      { restartBackupWatcher: () => restarts.push("ok"), purgeLogBuffer: () => 5 },
    );
    expect(outcome.applied).toBe(true);
    expect(restarts).toEqual(["ok"]);
    expect(outcome.action).toBe("restart_backup_watcher");

    const failed = await applyLiveFix(
      { action: "purge_log_buffer", reason: "OOM" },
      { restartBackupWatcher: () => undefined, purgeLogBuffer: () => { throw new Error("locked"); } },
    );
    expect(failed.applied).toBe(false);
    expect(failed.detail).toContain("fehlgeschlagen");
  });
});
