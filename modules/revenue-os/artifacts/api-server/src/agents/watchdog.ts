/**
 * Watchdog Manager — TypeScript-Implementierung
 * Überwacht alle Agenten im 5-Minuten-Takt.
 * - Erkennt FEHLER/TIMEOUT → automatischer Reset
 * - Erkennt 401-Fehler → ALARM im Log, Agent auf "wartend"
 * - Erkennt Stuck-Agenten (>30 Min) → Neustart via Queue
 * - Fallback-Zähler: Agent nach 50 Fallbacks auto-pausiert
 */

import { db } from "@workspace/db";
import { agentsTable, agentLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { openai, openaiVerfuegbar } from "../lib/openaiClient";

// SPRING 63 (Executive Directive): Prüfung alle 5 Minuten,
// Stuck-Erkennung bei status "aktiv" ohne Aktivität seit > 10 Minuten.
const WATCHDOG_INTERVALL_MS = 5 * 60 * 1000; // 5 Minuten
const STUCK_TIMEOUT_MS = 10 * 60 * 1000;     // 10 Minuten
const FALLBACK_SCHWELLE = 30; // SPRINT 36: Früher pausieren bei Fehlern                  // Nach 50 Fallbacks → Auto-Pause
const API_KEY_FEHLER_PATTERN = /401|Incorrect API key|Invalid API key/i;

let watchdogTimer: NodeJS.Timeout | null = null;
let watchdogZyklus = 0;

// ─── Heartbeat ────────────────────────────────────────────────────────────────
const heartbeats = new Map<number, Date>();

export function aktualisiereHeartbeat(agentId: number): void {
  heartbeats.set(agentId, new Date());
}

// ─── Fallback-Zähler ─────────────────────────────────────────────────────────
const fallbackZaehler = new Map<number, { count: number; agentName: string }>();

/** Wird von jedem Agenten aufgerufen wenn er in den Fallback-Modus schaltet */
export function inkrementiereFallbackZaehler(agentId: number, agentName: string): void {
  const aktuell = fallbackZaehler.get(agentId) ?? { count: 0, agentName };
  const neuerCount = aktuell.count + 1;
  fallbackZaehler.set(agentId, { count: neuerCount, agentName });

  // Alle 10 Fallbacks → WARN
  if (neuerCount % 10 === 0) {
    logger.warn(
      { agentId, agentName, fallbackCount: neuerCount },
      `⚠️ WARN: Fallback-Modus aktiv — ${agentName}: ${neuerCount} Fallbacks (kein API-Key)`
    );
  }

  // Nach 50 Fallbacks → Agent auto-pausieren
  if (neuerCount >= FALLBACK_SCHWELLE) {
    logger.error(
      { agentId, agentName, fallbackCount: neuerCount },
      `🚨 AUTO-PAUSE: ${agentName} nach ${neuerCount} Fallbacks gestoppt. ` +
      `Kein gültiger OPENAI_API_KEY als Umgebungsvariable gesetzt. Agent ressourcenschonend pausiert!`
    );

    // Async, kein await (non-blocking im Sync-Context)
    void db.update(agentsTable)
      .set({ status: "gestoppt", updatedAt: new Date() })
      .where(eq(agentsTable.id, agentId))
      .then(() => {
        void db.insert(agentLogsTable).values({
          agentId,
          agentName,
          aktion: "Watchdog: Auto-Pause nach 50 Fallbacks",
          status: "fehler",
          nachricht: `🚨 Agent nach ${neuerCount} Fallbacks automatisch pausiert. OPENAI_API_KEY prüfen!`,
        });
      });
  }
}

/** Exportiert den aktuellen Fallback-Zählerstand (für System-Status-API) */
export function holeFallbackZaehler(): Record<number, { count: number; agentName: string }> {
  return Object.fromEntries(fallbackZaehler);
}

/** Fallback-Zähler für einen Agenten zurücksetzen (nach Key-Update) */
export function resetFallbackZaehler(agentId: number): void {
  fallbackZaehler.delete(agentId);
}

// ─── Smart-Pause (30-Min-Pause bei 401 + Template-Rotation) ──────────────────
const SMART_PAUSE_MS = 30 * 60 * 1000; // 30 Minuten

interface SmartPause {
  bis: Date;
  agentName: string;
  grund: string;
}

const smartPausen = new Map<number, SmartPause>();

/**
 * Agent für 30 Min pausieren (z. B. nach 401). Der Agent crasht nicht — er
 * schaltet auf kostenlose Content-Template-Rotation um, bis die Pause abläuft.
 */
export function setzeSmartPause(agentId: number, agentName: string, grund = "OpenAI 401 — API-Key ungültig"): Date {
  const bis = new Date(Date.now() + SMART_PAUSE_MS);
  smartPausen.set(agentId, { bis, agentName, grund });
  logger.warn(
    { agentId, agentName, pausiertBis: bis.toISOString() },
    `⏸️ SMART-PAUSE: ${agentName} für 30 Min pausiert (${grund}) — Template-Rotation aktiv`,
  );
  return bis;
}

/** Prüft, ob ein Agent aktuell smart-pausiert ist (läuft automatisch ab). */
export function istSmartPausiert(agentId: number): boolean {
  const pause = smartPausen.get(agentId);
  if (!pause) return false;
  if (pause.bis.getTime() <= Date.now()) {
    smartPausen.delete(agentId);
    return false;
  }
  return true;
}

/** Smart-Pause manuell aufheben (z. B. nach Key-Update). */
export function hebeSmartPauseAuf(agentId: number): void {
  smartPausen.delete(agentId);
}

/** Aktive Smart-Pausen für die System-Status-API (abgelaufene werden entfernt). */
export function holeSmartPausen(): Array<{ agentId: number; agentName: string; grund: string; restMinuten: number }> {
  const jetzt = Date.now();
  const aktive: Array<{ agentId: number; agentName: string; grund: string; restMinuten: number }> = [];
  for (const [agentId, pause] of smartPausen.entries()) {
    if (pause.bis.getTime() <= jetzt) {
      smartPausen.delete(agentId);
      continue;
    }
    aktive.push({
      agentId,
      agentName: pause.agentName,
      grund: pause.grund,
      restMinuten: Math.ceil((pause.bis.getTime() - jetzt) / 60_000),
    });
  }
  return aktive;
}

// ─── Watchdog-Zyklus ─────────────────────────────────────────────────────────
async function fuehreWatchdogZyklusDurch(): Promise<void> {
  watchdogZyklus++;
  const startzeit = Date.now();

  try {
    const agenten = await db.select().from(agentsTable);
    const jetzt = new Date();
    const stuckGrenze = new Date(Date.now() - STUCK_TIMEOUT_MS);

    let zurueckgesetzt = 0;
    let alarme = 0;
    const alarmDetails: string[] = [];

    for (const agent of agenten) {
      // 1. FEHLER-Status → 401 oder generischer Fehler
      if (agent.status === "fehler") {
        const [letzterLog] = await db
          .select()
          .from(agentLogsTable)
          .where(eq(agentLogsTable.agentId, agent.id))
          .orderBy(desc(agentLogsTable.createdAt))
          .limit(1);

        const ist401 = letzterLog?.nachricht
          ? API_KEY_FEHLER_PATTERN.test(letzterLog.nachricht)
          : false;

        if (ist401) {
          await db.update(agentsTable)
            .set({ status: "wartend", updatedAt: jetzt })
            .where(eq(agentsTable.id, agent.id));

          await db.insert(agentLogsTable).values({
            agentId: agent.id,
            agentName: agent.name,
            aktion: "Watchdog: 401-Alarm",
            status: "fehler",
            nachricht: `🚨 ALARM: OpenAI 401. Agent auf "wartend" gesetzt. OPENAI_API_KEY erneuern!`,
          });

          alarme++;
          alarmDetails.push(`${agent.name}: API-Key 401`);
          logger.error({ agentId: agent.id, agentName: agent.name },
            `🚨 WATCHDOG ALARM: ${agent.name} — OpenAI 401!`);
        } else {
          await db.update(agentsTable)
            .set({ status: "wartend", updatedAt: jetzt })
            .where(eq(agentsTable.id, agent.id));

          await db.insert(agentLogsTable).values({
            agentId: agent.id,
            agentName: agent.name,
            aktion: "Watchdog: Auto-Reset",
            status: "erfolgreich",
            nachricht: `Watchdog hat ${agent.name} von FEHLER→WARTEND zurückgesetzt (Zyklus #${watchdogZyklus})`,
          });

          zurueckgesetzt++;
        }
      }

      // 2. PAUSIERT → Smart-Pause abgelaufen? → Key testen → auto-resumieren
      if (agent.status === "pausiert") {
        const pauseNochAktiv = istSmartPausiert(agent.id);
        if (!pauseNochAktiv) {
          // Smart-Pause ist abgelaufen — Key automatisch testen
          let keyGueltig = false;
          if (openaiVerfuegbar) {
            try {
              await openai.models.list();
              keyGueltig = true;
            } catch {
              keyGueltig = false;
            }
          }

          if (keyGueltig) {
            await db.update(agentsTable)
              .set({ status: "wartend", fehlerAnzahl: 0, updatedAt: jetzt })
              .where(eq(agentsTable.id, agent.id));
            hebeSmartPauseAuf(agent.id);

            await db.insert(agentLogsTable).values({
              agentId: agent.id,
              agentName: agent.name,
              aktion: "Watchdog: Auto-Resume",
              status: "erfolgreich",
              nachricht: `✅ API-Key gültig — ${agent.name} auto-resumiert (Smart-Pause abgelaufen)`,
            });

            logger.info({ agentId: agent.id, agentName: agent.name },
              `✅ WATCHDOG AUTO-RESUME: ${agent.name} — Key funktioniert, Agent resumiert`);
            zurueckgesetzt++;
          } else {
            // Key immer noch ungültig → Pause erneut setzen (weitere 30 Min)
            setzeSmartPause(agent.id, agent.name, "Watchdog-Test: Key weiterhin ungültig (401)");

            await db.insert(agentLogsTable).values({
              agentId: agent.id,
              agentName: agent.name,
              aktion: "Watchdog: Pause verlängert",
              status: "fehler",
              nachricht: `⏸️ API-Key weiterhin ungültig — Pause um 30 Min verlängert`,
            });

            alarme++;
            alarmDetails.push(`${agent.name}: Key weiterhin ungültig`);
            logger.warn({ agentId: agent.id }, `⏸️ WATCHDOG: ${agent.name} — Key weiterhin 401, Pause verlängert`);
          }
        }
        continue;
      }

      // 3. Erzwinge Queue-Verarbeitung (wecke wartende Jobs auf)
      // Dies stellt sicher, dass der Job-Queue-Loop aktiv bleibt
      
      // 4. AKTIV + stuck (keine Aktivität >10 Min)
      if (agent.status === "aktiv" && agent.letzteAktivitaet && agent.letzteAktivitaet < stuckGrenze) {
        const stuckSeit = Math.round((Date.now() - agent.letzteAktivitaet.getTime()) / 1000);

        await db.update(agentsTable)
          .set({ status: "wartend", updatedAt: jetzt })
          .where(eq(agentsTable.id, agent.id));

        await db.insert(agentLogsTable).values({
          agentId: agent.id,
          agentName: agent.name,
          aktion: "Watchdog: Timeout-Reset",
          status: "erfolgreich",
          nachricht: `Agent hängt seit ${stuckSeit}s → zurückgesetzt auf WARTEND`,
        });

        zurueckgesetzt++;
      }
    }

    // Aktive Queue-Verarbeitung triggern
    try {
      const { globalQueue } = await import("./JobQueue");
      // Bereinige alte Jobs (älter als 1h)
      globalQueue.bereinige(3600000);
    } catch {}
    
    const dauer = Date.now() - startzeit;
    logger.info({ zyklus: watchdogZyklus, zurueckgesetzt, alarme, dauer },
      `Watchdog-Zyklus #${watchdogZyklus}: ${zurueckgesetzt} resets, ${alarme} Alarme`);

    if (alarme > 0) {
      logger.error({ alarme, alarmDetails },
        `🚨 SYSTEM ALARM: ${alarme} Agenten mit API-Key-Fehler. OPENAI_API_KEY prüfen!`);
    }
  } catch (err) {
    logger.error({ err, zyklus: watchdogZyklus }, "Watchdog-Zyklus fehlgeschlagen");
  }
}

export function starteWatchdog(): void {
  if (watchdogTimer) return;

  setTimeout(() => { void fuehreWatchdogZyklusDurch(); }, 10_000);

  watchdogTimer = setInterval(() => {
    void fuehreWatchdogZyklusDurch();
  }, WATCHDOG_INTERVALL_MS);

  logger.info({ intervall: "5 Min", timeout: "10 Min Stuck", fallbackSchwelle: FALLBACK_SCHWELLE },
    "Watchdog Manager gestartet — 5-Min-Zyklus, 10-Min-Stuck-Reset, 401-Erkennung + Fallback-Tracking aktiv");
}

export function stoppeWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

export async function triggereWatchdog(): Promise<{ zyklus: number; dauer: number }> {
  const start = Date.now();
  await fuehreWatchdogZyklusDurch();
  return { zyklus: watchdogZyklus, dauer: Date.now() - start };
}
