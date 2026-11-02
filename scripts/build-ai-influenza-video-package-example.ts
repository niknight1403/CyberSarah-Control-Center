/**
 * Erzeugt ein BEISPIEL-Video-Paket aus einem klar markierten Fixture-Skript
 * und schreibt es als JSON. Kein LLM, kein Versand, keine Veröffentlichung:
 * das Skript ist Beispieltext, nicht generierter Kundeninhalt.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  approveAiInfluenzaVideoPackage,
  buildAiInfluenzaVideoPackage,
} from "../lib/ai-influenza-video-package-logic";

const FIXTURE_SCRIPT = [
  "Wir bauen Content, der Kunden bringt. ||| Nahaufnahme: Kalender mit geplanten Posts",
  "Zwölf Kurzvideos pro Monat, ohne Agentur-Overhead. ||| Split-Screen: Agentur-Team vs. Solo-Creator",
  "Jedes Video mit Skript, Untertiteln und Freigabe. ||| Bildschirm: Storyboard und SRT im Dashboard",
  "Starter ab 299 Euro monatlich, jederzeit kündbar. ||| Preiskarte mit Starter, Growth, Business",
].join("\n");

function main(): void {
  const pkg = buildAiInfluenzaVideoPackage({
    orderId: "example-order-fixture",
    taskLabel: "Beispiel: Kurzvideo 1/12 (Starter-Paket)",
    script: FIXTURE_SCRIPT,
  });
  const approved = approveAiInfluenzaVideoPackage(pkg, {
    approvedBy: "beispiel-freigabe (Fixture, keine echte Person)",
    approvedAt: new Date().toISOString(),
  });
  const target = resolve(process.argv[2] ?? "docs/beispiele/2026-11-02_ai-influenza-video-paket-beispiel.json");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(
    target,
    JSON.stringify(
      {
        hinweis: "BEISPIEL-Paket aus Fixture-Text zur Darstellung der Paketstruktur. Kein generierter Kundeninhalt, keine Veroeffentlichung.",
        paket: approved,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`geschrieben: ${target}`);
  console.log(`status=${approved.status} szenen=${approved.scenes.length} dauer=${approved.durationSeconds}s publishingTriggered=${approved.publishingTriggered}`);
}

main();
