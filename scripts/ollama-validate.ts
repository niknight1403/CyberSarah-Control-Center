/**
 * Sprint 349 — Ollama-Fleet-Validator: autonomer Belastungs-, Inferenz-
 * und Latenztest gegen die Ollama-REST-API des Remote-Servers. Misst
 * ehrlich (kein Fake-Gruen): Erreichbarkeit, installierte Leiter, Antwort-
 * qualitaet, Latenz pro Modell und Token-Durchsatz — und gibt am Ende
 * ein klares STATUS-Urteil nach der Flotten-Logik (lib/ollama-fleet-logic).
 *
 * Nutzung: OLLAMA_VALIDATE_BASE_URL=https://host/v1 npx tsx scripts/ollama-validate.ts
 * Default: http://127.0.0.1:11434 (lokaler Daemon / Sandbox-Modus).
 */
import {
  QWEN_LADDER,
  assessFleetHealth,
  planQwenPulls,
  readInstalledModels,
  recommendPrimaryRoute,
  type InferenceProbe,
  type QwenLadderModel,
} from "../lib/ollama-fleet-logic";

const BASE = (process.env.OLLAMA_VALIDATE_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");
const API = BASE.replace(/\/v1$/, "");
const ROUNDS = Number(process.env.OLLAMA_VALIDATE_ROUNDS ?? 3);

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status} bei ${url}`);
  return response.json();
}

async function main() {
  const log = (line: string) => console.log(line);
  log(`== Ollama-Fleet-Validator ==`);
  log(`Endpoint: ${BASE} · Runden pro Modell: ${ROUNDS}`);
  log("");

  log("[1/4] Erreichbarkeit …");
  const version = (await fetchJson(`${API}/api/version`)) as { version?: string };
  log(`-- Ollama-Version: ${version.version ?? "unbekannt"}`);
  log("");

  log("[2/4] Installierte Modelle …");
  const tags = (await fetchJson(`${API}/api/tags`)) as Parameters<typeof readInstalledModels>[0];
  const installed = readInstalledModels(tags);
  log(`-- Installiert: ${installed.length > 0 ? installed.join(", ") : "keine"}`);
  const pullPlan = planQwenPulls(installed);
  if (pullPlan.pulls.length > 0) {
    log(`-- Fehlend (Pull-Empfehlung): ${pullPlan.pulls.join(", ")}`);
    log(`-- Zu gross fuer dieses Ziel (bewusst uebersprungen): ${pullPlan.skippedTooLarge.join(", ") || "keine"}`);
  }
  log("");

  log("[3/4] Inferenz- und Latenzmessung …");
  const present = QWEN_LADDER.filter((model) => installed.includes(model));
  if (present.length === 0) {
    log("-- Keine Qwen-2.5-Modelle installiert — Abbruch ohne Fake-Urteil.");
    process.exit(1);
  }
  const probes: InferenceProbe[] = [];
  for (const model of present) {
    const latencies: number[] = [];
    let okRounds = 0;
    let tokensPerSecond: number | null = null;
    for (let round = 1; round <= ROUNDS; round++) {
      const startedAt = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120_000);
        const body = JSON.stringify({
          model,
          prompt: "Beantworte kurz und ehrlich: Was ist 2+3? Antworte nur mit der Zahl.",
          stream: false,
          options: { temperature: 0 },
        });
        const result = (await fetchJson(`${API}/api/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: controller.signal,
        })) as { response?: string; eval_count?: number; eval_duration?: number };
        clearTimeout(timer);
        const latencyMs = Date.now() - startedAt;
        latencies.push(latencyMs);
        const answered = (result.response ?? "").includes("5");
        if (answered) okRounds++;
        if (typeof result.eval_count === "number" && typeof result.eval_duration === "number" && result.eval_duration > 0) {
          tokensPerSecond = Number(((result.eval_count / (result.eval_duration / 1e9)) as number).toFixed(1));
        }
      } catch {
        latencies.push(180_000);
      }
    }
    const ok = okRounds === ROUNDS;
    const median = latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)];
    probes.push({ model, latencyMs: median, tokensPerSecond, ok });
    log(`-- ${model}: ${okRounds}/${ROUNDS} korrekt · Median ${median} ms · ${tokensPerSecond ?? "?"} Tok/s`);
  }
  log("");

  log("[4/4] Urteil (ehrliche Flotten-Logik) …");
  const fleet = assessFleetHealth(probes);
  const best = probes.filter((probe) => probe.ok).sort((a, b) => a.latencyMs - b.latencyMs)[0];
  const route = recommendPrimaryRoute(fleet, best?.latencyMs ?? 180_000);
  log(`-- STATUS: ${fleet.status.toUpperCase()}`);
  log(`-- ${fleet.headline}`);
  for (const reason of fleet.reasons) log(`-- Grund: ${reason}`);
  log(`-- Rotator-Empfehlung: primaere Route = ${route === "ollama" ? "Ollama (lokal/remote)" : "Cloud-Gratis-Kette (Groq/OpenRouter/Gemini)"}`);
  if (fleet.status === "green") {
    log("");
    log("STATUS: GRUEN — Ollama-Flotte messbar stabil und im Latenzrahmen.");
    process.exit(0);
  }
  if (fleet.status === "yellow") {
    log("");
    log("STATUS: GELB — einschraenkt nutzbar; Rotator weicht bei Last aus.");
    process.exit(0);
  }
  log("");
  log("STATUS: ROT — keine stabile Inferenz. Rotator bleibt auf Cloud-Gratis-Routen.");
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error(`Validierung fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannter Fehler"}`);
  process.exit(1);
});
