/**
 * llmRoutingChangerAgent — Autonomer LLM- & Werkzeug-Routing-Changer
 *
 * Zwei autonome Aufgaben pro Zyklus:
 *   1. LLM-Routing wechseln: Alle kostenlosen Provider prüfen, den günstigsten
 *      verfügbaren aktivieren, tote Provider pausieren — maximale Umsatzmarge
 *      durch minimale API-Kosten (Ziel: 100 % kostenlose Inferenz).
 *   2. Werkzeug-Anbindungen managen: Connector-Sweep über alle Social/Payment/
 *      E-Mail-Anbindungen, tote deaktivieren, wiederhergestellte reaktivieren.
 */
import { db } from "@workspace/db";
import { agentLogsTable } from "@workspace/db";
import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import {
  routeLLM,
  holeProviderSnapshot,
  holeAktivenProvider,
} from "../lib/llmRouter";
import { pruefeAlleConnector, holeConnectorSnapshot } from "../lib/toolConnectorManager";
import { logger } from "../lib/logger";

export class LlmRoutingChangerAgent extends AgentBase {
  constructor() {
    super("LLM-Routing-Changer (autonom)", "llm_routing_changer");
  }

  protected beschreibungText(): string {
    return "Wechselt autonom zwischen kostenlosen LLM-Anbietern (Groq, Gemini, OpenRouter, Cerebras, HF, Mistral, Ollama) und verwaltet alle Werkzeug-Anbindungen — Ziel: maximale Autonomie bei minimalen laufenden Kosten.";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const start = Date.now();
    try {
      // ── Phase 1: LLM-Provider-Sweep mit echter Testanfrage ────────────────
      let providerErgebnis: Awaited<ReturnType<typeof routeLLM>> | null = null;
      try {
        providerErgebnis = await routeLLM({
          prompt: "Antworte nur mit dem Wort: OK",
          maxTokens: 10,
          nurKostenlos: false,
          zeitlimitMs: 10_000,
        });
      } catch (err) {
        logger.warn({ fehler: err }, "Routing-Changer: kein Provider erreichbar");
      }

      const providerSnapshot = holeProviderSnapshot();
      const konfiguriert = providerSnapshot.filter((p) => p.konfiguriert);
      const kostenlosKonfiguriert = konfiguriert.filter((p) => p.kostenlos);
      const aktiv = holeAktivenProvider();

      // ── Phase 2: Werkzeug-Connector-Sweep ─────────────────────────────────
      const connectorSweep = await pruefeAlleConnector();
      const connectorSnapshot = holeConnectorSnapshot();
      const aktiveConnectors = connectorSnapshot.filter((c) => c.aktiv);

      // ── Buchhaltung ───────────────────────────────────────────────────────
      const zusammenfassung =
        `LLM-Route: ${providerErgebnis?.providerId ?? "keiner"} ` +
        `(${providerErgebnis?.kostenpflichtig ? "kostenpflichtig" : "kostenlos"}), ` +
        `kostenlose Provider konfiguriert: ${kostenlosKonfiguriert.length}, ` +
        `Connector aktiv: ${aktiveConnectors.length}/${connectorSnapshot.length}`;

      try {
        if (this.agentId) {
          await db.insert(agentLogsTable).values({
            agentId: this.agentId,
            agentName: "LLM-Routing-Changer (autonom)",
            aktion: "routing_sweep",
            status: providerErgebnis ? "erfolgreich" : "warnung",
            nachricht: zusammenfassung,
            metadaten: JSON.stringify({
              aktiverProvider: aktiv?.id ?? null,
              provider: providerSnapshot,
              connector: connectorSnapshot,
            }),
          });
        }
      } catch {
        /* Logging best effort */
      }

      return {
        success: true,
        message: zusammenfassung,
        metadaten: {
          aktiverProvider: aktiv?.id ?? null,
          aktivesModell: aktiv?.modell ?? null,
          kostenlosAktiv: providerErgebnis ? !providerErgebnis.kostenpflichtig : null,
          kostenloseProviderKonfiguriert: kostenlosKonfiguriert.length,
          providerInsgesamt: providerSnapshot.length,
          connectorSweep,
          aktiveConnectors: aktiveConnectors.map((c) => c.id),
        },
        dauer: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        message: `Routing-Changer fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
        dauer: Date.now() - start,
      };
    }
  }
}
