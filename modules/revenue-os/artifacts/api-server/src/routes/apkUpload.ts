import { Router, type IRouter, type Request, type Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apkDir = path.resolve(__dirname, "../../../apk");

// Ensure directory exists
try { fs.mkdirSync(apkDir, { recursive: true }); } catch {}

// Simple APK upload via base64 or URL
router.post("/upload-apk", async (req: Request, res: Response) => {
  try {
    const { filename, data } = req.body || {};
    if (!filename || !data || !filename.endsWith(".apk")) {
      res.status(400).json({ success: false, message: "filename (ending .apk) and base64 data required" });
      return;
    }
    const safeName = path.basename(filename);
    const filePath = path.join(apkDir, safeName);
    const buffer = Buffer.from(data, "base64");
    fs.writeFileSync(filePath, buffer);
    logger.info({ filename: safeName, size: buffer.length }, "APK saved");
    res.json({ success: true, filename: safeName, url: `/apk/${safeName}`, size: buffer.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "APK upload failed");
    res.status(500).json({ success: false, message: msg });
  }
});

router.post("/upload-apk-from-url", async (req: Request, res: Response) => {
  try {
    const { url, filename } = req.body || {};
    if (!url || !filename) {
      res.status(400).json({ success: false, message: "url and filename required" });
      return;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const safeName = path.basename(filename);
    const filePath = path.join(apkDir, safeName);
    fs.writeFileSync(filePath, buffer);
    logger.info({ filename: safeName, size: buffer.length }, "APK downloaded from URL");
    res.json({ success: true, filename: safeName, url: `/apk/${safeName}`, size: buffer.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "APK URL download failed");
    res.status(500).json({ success: false, message: msg });
  }
});

router.get("/apk-list", (_req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(apkDir).filter(f => f.endsWith(".apk"));
    const apks = files.map(f => ({
      name: f,
      size: fs.statSync(path.join(apkDir, f)).size,
      url: `/apk/${f}`,
    }));
    res.json({ success: true, apks });
  } catch {
    res.json({ success: false, apks: [] });
  }
});

export default router;
