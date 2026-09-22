/**
 * liveProblemLoeserAgent — Live-Problem-Löser (Sprint 65)
 *
 * Überwacht das System laufend und behebt Probleme AUTONOM:
 *
 *   1. PostgreSQL        → Verbindungstest; bei Ausfall: Retry + Admin-Alarm
 *   2. LLM-Provider      → autonome Routen-Prüfung; der Router wechselt bei
 *                          Fehlern selbstständig auf den nächsten kostenlosen
 *                          Anbieter (Groq → Gemini → OpenRouter → Ollama …)
 *   3. API-Keys           → blockierte OpenAI-Keys erkennen; wenn ALLE blockiert
 *                          sind: autonome Global-Deblockierung (Self-Healing)
 *   4. Werkzeug-Anbindungen → Connector-Sweep: tote deaktivieren, erholt
 *                          wieder aktivieren (toolConnectorManager)
 *   5. Agenten-Fehler     → Fehlerhäufung der letzten Stunde erkennen,
 *                          fehlgeschlagene Jobs über die globale Queue erneut
 *                          einreihen und Admin alarmieren (pushNotifications)
 *
 * Läuft periodisch über den Orchestrator und zusätzlich über einen eigenen
 * Intervall-Loop beim Server-Start (index.ts).
 */
import { db } from "@workspace/db";
import { agentLogsTable } from "@workspace/db";
import { sql, gte, and, eq, inArray } from "drizzle-orm";
import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";
import { routeLLM, holeProviderSnapshot } from "../lib/llmRouter";
import { pruefeAlleConnector } from "../lib/toolConnectorManager";
import { holeAlleKeys, istKeyBlockiert, deblockiereKey } from "../lib/openaiClient";
import { globalQueue } from "./JobQueue";
import { logger } from "../lib/logger";

export interface ProblemBericht {
  bereich: string;
  problem: string;
  loesung: string;
  geloest: boolean;
}

export class LiveProblemLoeserAgent extends AgentBase {
  constructor() {
    super("Live-Problem-Löser (autonom)", "live_problem_loeser");
  }

  protected beschreibungText(): string {
    return "Überwacht das System live und behebt Probleme autonom: DB-Retries, LLM-Routenwechsel, API-Key-Self-Healing, Connector-Wiederherstellung, fehlgeschlagene Jobs erneut einreihen, Admin-Alarm bei kritischen Zuständen.";
  }

  async ausfuehren(_aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const start = Date.now();
    const berichte: ProblemBericht[] = [];

    // ── 1. PostgreSQL-Überwachung ───────────────────────────────────────────
    let dbOk = false;
    for (let versuch = 1; versuch <= 3 && !dbOk; versuch++) {
      try {
        await db.execute(sql`SELECT 1`);
        dbOk = true;
      } catch (err) {
        berichte.push({
          bereich: "PostgreSQL",
          problem: `Verbindung fehlgeschlagen (Versuch ${versuch}): ${err instanceof Error ? err.message : String(err)}`,
          loesung: "Automatischer Retry",
          geloest: false,
        });
        await new Promise((r) => setTimeout(r, versuch * 2000));
      }
    }
    if (dbOk) {
      if (berichte.some((b) => b.bereich === "PostgreSQL")) {
        berichte.push({ bereich: "PostgreSQL", problem: "Verbindung war unterbrochen", loesung: "Retry erfolgreich — Verbindung wiederhergestellt", geloest: true });
      }
    } else {
      await this.alarmiereAdmin("KRITISCH: PostgreSQL nach 3 Retries unerreichbar — Server-Neustart oder DB-Hosting prüfen!");
    }

    // ── 2. LLM-Route prüfen (autonomer Wechsel durch Router) ───────────────
    let llmOk = false;
    try {
      const ergebnis = await routeLLM({
        prompt: "Antworte nur mit: OK",
        maxTokens: 10,
        zeitlimitMs: 10_000,
      });
      llmOk = true;
      if (ergebnis.kostenpflichtig) {
        berichte.push({
          bereich: "LLM-Routing",
          problem: "Aktive Route läuft über einen kostenpflichtigen Anbieter",
          loesung: `Hinweis protokolliert (aktiv: ${ergebnis.providerId}) — kostenlose Provider priorisieren`,
          geloest: true,
        });
      }
    } catch (err) {
      const provider = holeProviderSnapshot();
      berichte.push({
        bereich: "LLM-Routing",
        problem: `Kein Provider erreichbar: ${err instanceof Error ? err.message : String(err)}`,
        loesung: `Alle ${provider.filter((p) => p.konfiguriert).length} konfigurierten Provider geprüft — Credentials prüfen (mindestens einen kostenlosen Key setzen: GROQ_API_KEY oder GEMINI_API_KEY)`,
        geloest: false,
      });
    }

    // ── 3. API-Key-Self-Healing ────────────────────────────────────────────
    try {
      const alle = holeAlleKeys();
      const blockiert = alle.filter((k) => istKeyBlockiert(k));
      if (alle.length > 0 && blockiert.length === alle.length) {
        for (const k of blockiert) deblockiereKey(k);
        berichte.push({
          bereich: "API-Keys",
          problem: "Alle OpenAI-Keys waren blockiert (429/401-Kaskade)",
          loesung: "Autonome Global-Deblockierung durchgeführt — Keys erneut freigegeben",
          geloest: true,
        });
      }
    } catch {
      /* openaiClient ggf. nicht initialisiert — kein Handlungsbedarf */
    }

    // ── 4. Werkzeug-Anbindungen heilen ─────────────────────────────────────
    try {
      const sweep = await pruefeAlleConnector();
      if (sweep.deaktiviert > 0 || sweep.reaktiviert > 0) {
        berichte.push({
          bereich: "Werkzeug-Anbindungen",
          problem: `${sweep.deaktiviert} Anbindungen tot, ${sweep.reaktiviert} wiederhergestellt`,
          loesung: "Autonomer Connector-Sweep: tote deaktiviert, erholt reaktiviert",
          geloest: true,
        });
      }
    } catch (err) {
      berichte.push({
        bereich: "Werkzeug-Anbindungen",
        problem: `Connector-Sweep fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`,
        loesung: "Nächster Sweep versucht es erneut",
        geloest: false,
      });
    }

    // ── 5. Fehlgeschlagene Agenten-Jobs erkennen + erneut einreihen ────────
    try {
      const vorEineStunde = new Date(Date.now() - 60 * 60 * 1000);
      const fehlerLogs = await db
        .select({ id: agentLogsTable.id, agentName: agentLogsTable.agentName, aktion: agentLogsTable.aktion, nachricht: agentLogsTable.nachricht })
        .from(agentLogsTable)
        .where(
          and(
            gte(agentLogsTable.createdAt, vorEineStunde),
            inArray(agentLogsTable.status, ["fehler", "error", "fehlgeschlagen"]),
          ),
        )
        .limit(50);

      if (fehlerLogs.length >= 5) {
        // Welle von Fehler-Logs → fehlgeschlagene Agenten-Aufgaben erneut einreihen
        let neuEingereiht = 0;
        for (const log of fehlerLogs.slice(0, 10)) {
          if (log.aktion && log.aktion.includes("_")) {
            globalQueue.fuegeHinzu(log.aktion.split("_")[0], { wiederholung: true, quelle: "live_problem_loeser" }, { prioritaet: 2, maxVersuche: 2 });
            neuEingereiht += 1;
          }
        }
        berichte.push({
          bereich: "Agenten-Jobs",
          problem: `${fehlerLogs.length} Fehler-Logs in der letzten Stunde`,
          loesung: `${neuEingereiht} Aufgaben autonom erneut eingereiht`,
          geloest: true,
        });
        if (fehlerLogs.length >= 20) {
          await this.alarmiereAdmin(`WARNUNG: ${fehlerLogs.length} Agenten-Fehler in der letzten Stunde — System prüfen`);
        }
      }
    } catch {
      /* DB ggf. noch down — wurde oben bereits alamiert */
    }

    // ── Buchhaltung ─────────────────────────────────────────────────────────
    const geloest = berichte.filter((b) => b.geloest).length;
    const offen = berichte.filter((b) => !b.geloest).length;
    const kritisch = !dbOk || !llmOk;

    try {
      await this.setzeStatus(kritisch ? "fehler" : "aktiv");
    } catch {
      /* Status-Schreiben best effort */
    }

    if (this.agentId) {
      try {
        await db.insert(agentLogsTable).values({
          agentId: this.agentId,
          agentName: "Live-Problem-Löser (autonom)",
          aktion: "live_check",
          status: offen === 0 ? "erfolgreich" : "warnung",
          nachricht: `${berichte.length} Ereignisse: ${geloest} gelöst, ${offen} offen | DB ${dbOk ? "OK" : "DOWN"} | LLM ${llmOk ? "OK" : "OFFLINE"}`,
          metadaten: JSON.stringify({ berichte, dbOk, llmOk }),
        });
      } catch {
        /* Logging best effort */
      }
    }

    logger.info(
      { geloest, offen, dbOk, llmOk },
      `🔧 Live-Problem-Löser: ${geloest} Probleme autonom gelöst, ${offen} offen`,
    );

    return {
      success: !kritisch,
      message: `Live-Check abgeschlossen: ${geloest} gelöst, ${offen} offen (DB ${dbOk ? "OK" : "DOWN"}, LLM ${llmOk ? "OK" : "OFFLINE"})`,
      metadaten: { berichte, geloest, offen, dbOk, llmOk },
      dauer: Date.now() - start,
    };
  }

  private async alarmiereAdmin(text: string): Promise<void> {
    try {
      const { sendSystemAlert } = await import("../lib/pushNotifications");
      await sendSystemAlert(text);
    } catch {
      /* Push nicht konfiguriert — Log genügt */
    }
    logger.error({ alarm: text }, "🚨 Live-Problem-Löser: Admin-Alarm ausgelöst");
  }
}

/** Einmaliger Intervall-Loop für index.ts (läuft unabhängig vom Orchestrator). */
export function starteLiveProblemLoeser(intervallMs = 5 * 60 * 1000): NodeJS.Timeout {
  const agent = new LiveProblemLoeserAgent();
  const laufe = async () => {
    try {
      await agent.initialisieren();
      await agent.ausfuehren({
        id: `live-${Date.now()}`,
        typ: "live_check",
        payload: {},
        prioritaet: 1,
        versuche: 0,
        maxVersuche: 1,
        erstelltAm: new Date(),
      });
    } catch (err) {
      logger.warn({ err }, "Live-Problem-Löser Zyklus fehlgeschlagen — nächster Versuch beim nächsten Intervall");
    }
  };
  void laufe(); // sofort einmal ausführen
  return setInterval(laufe, intervallMs);
}
