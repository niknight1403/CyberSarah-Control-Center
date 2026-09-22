import { Router, type IRouter } from "express";
import { masterAgent } from "../agents/masterAgentState";

const router: IRouter = Router();

// Autostart beim Laden der Route — abgesichert
try {
  masterAgent.start();
} catch (err) {
  console.warn("⚠️ MasterAgent konnte nicht gestartet werden:", (err as Error).message);
}

router.get("/master-agent", (_req, res) => {
  try {
    res.json(masterAgent.getState());
  } catch (err) {
    res.status(500).json({ error: "MasterAgent nicht verfügbar", detail: (err as Error).message });
  }
});

router.post("/master-agent/run/:agent", async (req, res) => {
  try {
    const agent = req.params.agent as "keys" | "finance" | "social";
    res.json(await masterAgent.runNow(agent));
  } catch (err) {
    res.status(500).json({ error: "Agent-Ausführung fehlgeschlagen", detail: (err as Error).message });
  }
});

export default router;
