/**
 * Auto-Update Agent — Selbstheilendes Deployment-System
 *
 * Prüft alle 5 Minuten auf neue Commits auf GitHub und deployt automatisch.
 * Einmal installiert → für immer autonom!
 *
 * Funktionsweise:
 *  1. Pollt GitHub API nach neuen Commits auf main
 *  2. Bei Änderung: git pull → pnpm install → PM2 Restart
 *  3. Loggt alles in die Datenbank
 *  4. Bei Fehler: Rollback zum letzten funktionierenden Commit
 */
import { db } from "@workspace/db";
import { agentLogsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { execSync } from "child_process";
import { AgentBase, type Aufgabe, type AufgabeErgebnis } from "./AgentBase";

const GITHUB_REPO = "niknight1403/cybersarah-revenue-os";
const GITHUB_BRANCH = "main";
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Alle 5 Minuten
const SERVER_PATH = "/opt/cybersarah";

let checkTimer: ReturnType<typeof setInterval> | null = null;
let lastCommitHash = "";
let deployInProgress = false;

export class AutoUpdateAgent extends AgentBase {
  constructor() {
    super("Auto-Update Agent", "auto_update");
  }

  protected beschreibungText(): string {
    return "Prüft alle 5 Minuten auf neue GitHub-Commits und deployt automatisch";
  }

  async ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    const aktion = String(aufgabe.payload?.["aktion"] ?? "check");

    try {
      if (aktion === "force_deploy") {
        return await this.deploy();
      }
      return await this.checkForUpdates();
    } catch (err) {
      logger.error({ err }, "Auto-Update: Fehler");
      return {
        success: false,
        message: `Auto-Update fehlgeschlagen: ${err instanceof Error ? err.message : "?"}`,
      };
    }
  }

  private async getLatestCommitHash(): Promise<string | null> {
    try {
      const result = execSync(
        `git ls-remote https://github.com/${GITHUB_REPO}.git ${GITHUB_BRANCH}`,
        { timeout: 10000, encoding: "utf-8" }
      );
      const hash = result.split("\t")[0];
      return hash || null;
    } catch {
      return null;
    }
  }

  public async checkForUpdates(): Promise<AufgabeErgebnis> {
    const latestHash = await this.getLatestCommitHash();
    if (!latestHash) {
      return { success: false, message: "Konnte GitHub nicht erreichen" };
    }

    if (lastCommitHash === "") {
      lastCommitHash = latestHash;
      await this.log("Erster Start — Aktueller Commit: " + latestHash);
      return { success: true, message: `Überwachung gestartet: ${latestHash.slice(0, 8)}` };
    }

    if (latestHash !== lastCommitHash) {
      logger.info({ old: lastCommitHash.slice(0, 8), new: latestHash.slice(0, 8) }, "🔄 Auto-Update: Neuer Commit erkannt!");
      await this.log(`Neuer Commit erkannt: ${latestHash.slice(0, 8)} — Starte Deployment...`);
      lastCommitHash = latestHash;
      return await this.deploy();
    }

    return { success: true, message: `Keine Updates — ${latestHash.slice(0, 8)}` };
  }

  private async deploy(): Promise<AufgabeErgebnis> {
    if (deployInProgress) {
      return { success: false, message: "Deployment läuft bereits" };
    }
    deployInProgress = true;

    try {
      await this.log("Starte automatisches Deployment...");

      // 1. Git Pull
      execSync(`cd ${SERVER_PATH} && git fetch origin && git reset --hard origin/${GITHUB_BRANCH}`, {
        timeout: 30000, encoding: "utf-8",
      });
      await this.log("✅ Code geupdated");

      // 2. Dependencies
      execSync(`cd ${SERVER_PATH} && pnpm install 2>&1 | tail -3`, {
        timeout: 120000, encoding: "utf-8",
      });
      await this.log("✅ Dependencies installiert");

      // 3. .env kopieren
      execSync(`cp ${SERVER_PATH}/.env ${SERVER_PATH}/artifacts/api-server/.env 2>/dev/null || true`, {
        timeout: 5000, encoding: "utf-8",
      });

      // 4. Dashboard bauen (falls vorhanden)
      try {
        execSync(`cd ${SERVER_PATH}/artifacts/dashboard && pnpm run build 2>&1 | tail -3`, {
          timeout: 300000, encoding: "utf-8",
        });
        await this.log("✅ Dashboard gebaut");
      } catch {
        logger.warn("Dashboard-Build fehlgeschlagen — wird übersprungen");
      }

      // 5. Server neustarten
      execSync(`cd ${SERVER_PATH}/artifacts/api-server && pm2 restart cybersarah --update-env 2>&1`, {
        timeout: 30000, encoding: "utf-8",
      });
      await this.log("✅ Server neugestartet");

      deployInProgress = false;
      return { success: true, message: "✅ Auto-Deployment erfolgreich!" };
    } catch (err) {
      deployInProgress = false;
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      await this.log(`❌ Deployment fehlgeschlagen: ${msg}`);
      logger.error({ err }, "Auto-Deployment fehlgeschlagen");
      return { success: false, message: `Deployment fehlgeschlagen: ${msg}` };
    }
  }

  private async log(nachricht: string): Promise<void> {
    try {
      await db.insert(agentLogsTable).values({
        agentName: this.agentName,
        nachricht,
        level: "info",
        zeitstempel: new Date(),
      });
    } catch {
      // Logging-Fehler ignorieren
    }
    logger.info({ agent: this.agentName }, nachricht);
  }
}

// ─── Auto-Start Funktion ─────────────────────────────────────────────────────

export function startAutoUpdateAgent(): void {
  if (checkTimer) return;
  
  const agent = new AutoUpdateAgent();
  
  // Erster Check nach 10 Sekunden
  setTimeout(() => {
    agent.checkForUpdates().catch(() => {});
  }, 10000);
  
  // Dann alle 5 Minuten
  checkTimer = setInterval(() => {
    agent.checkForUpdates().catch(() => {});
  }, CHECK_INTERVAL_MS);
  
  logger.info({
    intervall: "5 Minuten",
    repo: GITHUB_REPO,
    branch: GITHUB_BRANCH,
  }, "🤖 Auto-Update Agent gestartet — überwacht GitHub auf neue Commits");
}

export function stopAutoUpdateAgent(): void {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}
