import { Router, type IRouter, type Request, type Response } from "express";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const DEPLOY_TOKEN = process.env["DEPLOY_TOKEN"];
const PROJECT_DIR = path.resolve(import.meta.dirname ?? ".", "../../../..");

// Simple auth check
function checkToken(req: Request, res: Response): boolean {
  const token = req.headers["x-deploy-token"] || req.query["token"];
  if (token !== DEPLOY_TOKEN) {
    res.status(401).json({ success: false, message: "Invalid token" });
    return false;
  }
  return true;
}

// POST /api/admin/deploy — Pull latest code and restart server
router.post("/deploy", async (req: Request, res: Response) => {
  if (!checkToken(req, res)) return;

  try {
    logger.info("🚀 Deploy triggered via API");

    // Run git pull
    const pullResult = execSync("git fetch origin && git reset --hard origin/main", {
      cwd: PROJECT_DIR,
      timeout: 60000,
      encoding: "utf-8",
    });

    logger.info("📥 Git pull done");

    // Install dependencies
    const installResult = execSync("pnpm install --frozen-lockfile 2>/dev/null || pnpm install", {
      cwd: PROJECT_DIR,
      timeout: 120000,
      encoding: "utf-8",
    });

    logger.info("📦 Dependencies installed");

    // Copy .env
    try {
      execSync("cp .env artifacts/api-server/.env 2>/dev/null || true", {
        cwd: PROJECT_DIR,
        timeout: 5000,
      });
    } catch {}

    res.json({
      success: true,
      message: "Code updated. Restarting server...",
      pullOutput: pullResult.slice(-500),
    });

    // Restart PM2 process in background
    setTimeout(() => {
      try {
        execSync("pm2 restart cybersarah --update-env", {
          cwd: path.join(PROJECT_DIR, "artifacts/api-server"),
          timeout: 30000,
          stdio: "pipe",
        });
        logger.info("✅ Server restarted after deploy");
      } catch (e) {
        logger.error({ err: e }, "Server restart failed after deploy");
      }
    }, 1000);

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "Deploy failed");
    res.status(500).json({ success: false, message: msg });
  }
});

// GET /api/admin/status — Detailed system status
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const gitLog = execSync("git log --oneline -3", { cwd: PROJECT_DIR, timeout: 5000, encoding: "utf-8" });
    const gitBranch = execSync("git branch --show-current", { cwd: PROJECT_DIR, timeout: 5000, encoding: "utf-8" }).trim();
    const diskUsage = execSync("df -h / | tail -1", { timeout: 5000, encoding: "utf-8" }).trim();
    const memUsage = execSync("free -h | grep Mem", { timeout: 5000, encoding: "utf-8" }).trim();
    const uptime = execSync("uptime -p", { timeout: 5000, encoding: "utf-8" }).trim();
    const pm2Status = execSync("pm2 status cybersarah --no-color 2>/dev/null || echo 'PM2 not checked'", { timeout: 5000, encoding: "utf-8" }).trim();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      server: { uptime, disk: diskUsage, memory: memUsage },
      git: { branch: gitBranch, lastCommits: gitLog.trim().split("\n") },
      pm2: pm2Status,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ success: false, message: msg });
  }
});

// POST /api/admin/watchdog-trigger — Force watchdog cycle
router.post("/watchdog-trigger", async (_req: Request, res: Response) => {
  try {
    const { triggereWatchdog } = await import("../agents/watchdog");
    const result = await triggereWatchdog();
    res.json({ success: true, message: "Watchdog triggered", result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ success: false, message: msg });
  }
});

// GET /api/admin/logs — Recent agent logs
router.get("/logs", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query["limit"]) || 50, 200);
    const { db } = await import("@workspace/db");
    const { agentLogsTable } = await import("@workspace/db");
    const { desc } = await import("drizzle-orm");

    const logs = await db
      .select()
      .from(agentLogsTable)
      .orderBy(desc(agentLogsTable.createdAt))
      .limit(limit);

    res.json({ success: true, logs, total: logs.length });
  } catch (err) {
    res.status(500).json({ success: false, message: "Logs not available" });
  }
});

export default router;
