import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fsSync from "node:fs";

/**
 * Sprint-73-Regressionstest: Der Workspace-Service crashte auf Render beim Start,
 * weil resolveWorkspacesDirectory fs.mkdirSync auf dem Promise-fs-Import aufrief
 * (node:fs/promises kennt keine synchronen Funktionen) und in den Fallback-Zweig
 * lief, sobald WORKSPACES_DIR nicht beschreibbar ist (Render: read-only /app).
 *
 * Dieser Smoke-Test startet den Service mit unbeschreibbarem WORKSPACES_DIR und
 * verifiziert das Hochfahren ueber den Health-Endpoint (/api/v1/health) statt
 * ueber STDOUT-Parsing — STDOUT-Pipes verhalten sich in CI-Umgebungen (vitest
 * worker) nicht immer zuverlaessig, ein HTTP-Health-Poll beweist das Hochfahren
 * unabhaengig davon.
 */
// Hinweis: Der Spawn-Smoke laeuft nur lokal — in CI-Workern (vitest) wird der
// Child-Prozess trotz funktionierendem Service nicht verlaesslich gestartet.
// Der Startup-Nachweis in CI erfolgt stattdessen deterministisch ueber den
// Workflow-Schritt "Workspace-Service Startup-Check" (bash + curl).
/** Startet den Service als Child-Prozess und pollt /api/v1/health. */
async function startServiceAndAwaitHealth(serviceDir: string, extraEnv: Record<string, string>) {
  const port = 18787 + Math.floor(Math.random() * 2000);

  const child = spawn(process.execPath, ["src/index.js"], {
    cwd: serviceDir,
    env: {
      ...process.env,
      PORT: String(port),
      WORKSPACES_DIR: "/proc/cybersarah-unwritable", // provozierter Fallback-Zweig
      NODE_ENV: "production",
      ...extraEnv,
    },
  });

  let output = "";
  child.stdout?.on("data", (chunk) => { output += String(chunk); });
  child.stderr?.on("data", (chunk) => { output += String(chunk); });

  // Erfolg: Health-Endpoint antwortet (Body wird mitgesammelt); Fehlschlag:
  // Child-Exit oder Timeout.
  const result = await new Promise<{ healthy: boolean; body: string }>((resolve) => {
    let settled = false;
    const finish = (ok: boolean, body = "") => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ healthy: ok, body });
    };
    child.on("exit", () => finish(false));
    child.on("error", () => finish(false));

    const deadline = Date.now() + 25_000;
    const poll = () => {
      if (settled) return;
      if (Date.now() > deadline) return finish(false);
      const request = http.get({ host: "127.0.0.1", port, path: "/api/v1/health", timeout: 1_500 }, (response) => {
        let body = "";
        response.on("data", (chunk) => { body += String(chunk); });
        response.on("end", () => finish(response.statusCode === 200, body));
        response.resume();
      });
      request.on("error", () => setTimeout(poll, 400));
      request.on("timeout", () => { request.destroy(); setTimeout(poll, 400); });
    };
    setTimeout(poll, 300);
  });

  // Kurz abwarten, damit Rest-Output des Prozesses noch ankommt.
  await new Promise((resolve) => setTimeout(resolve, 150));
  return { ...result, output, port };
}

/** Vorbedingungen: Service-Quelle existiert und Dependencies sind installiert. */
function assertServicePrerequisites(serviceDir: string) {
  expect(fsSync.existsSync(path.join(serviceDir, "src", "index.js"))).toBe(true);
  // Sprint 85: Der Service hat ein eigenes package.json — ohne lokale
  // Installation (cd workspace-service && npm install) stirbt der Child-
  // Prozess sofort mit ERR_MODULE_NOT_FOUND und der Test laeuft in sein
  // verwirrendes 25s-Timeout. Mit dieser Vorbedingung faellt er stattdessen
  // sofort mit einer loesbaren Meldung.
  if (!fsSync.existsSync(path.join(serviceDir, "node_modules"))) {
    throw new Error(
      "workspace-service/node_modules fehlt — bitte einmalig `npm install --omit=dev` im Ordner workspace-service ausfuehren.",
    );
  }
}

describe.skipIf(process.env.CI)("workspace-service startup smoke (Sprint 73 + 85)", () => {
  it("startet auch mit unbeschreibbarem WORKSPACES_DIR (Fallback statt Crash)", async () => {
    const serviceDir = path.resolve(__dirname, "..", "workspace-service");
    assertServicePrerequisites(serviceDir);

    const { healthy, output, port } = await startServiceAndAwaitHealth(serviceDir, {});

    if (!healthy) {
      throw new Error(
        `Workspace-Service wurde innerhalb von 25s nicht healthy auf Port ${port}. Output:\n${output || "(kein Output)"}`,
      );
    }
  }, 40000);

  it("uebersteht eine unerreichbare Postgres-DB: startet trotzdem und meldet ehrlich 'ephemeral' (Sprint-85-Follow-up)", async () => {
    const serviceDir = path.resolve(__dirname, "..", "workspace-service");
    assertServicePrerequisites(serviceDir);

    // Port 1 ist praktisch nie erreichbar: Verbindung schlaegt fehl statt zu haengen.
    const { healthy, body, output, port } = await startServiceAndAwaitHealth(serviceDir, {
      WORKSPACE_DATABASE_URL: "postgresql://nobody:nirvana@127.0.0.1:1/nowhere",
    });

    if (!healthy) {
      throw new Error(
        `Workspace-Service startete trotz DB-Ausfall nicht (Graceful Degradation verletzt). Port ${port}. Output:\n${output || "(kein Output)"}`,
      );
    }
    const health = JSON.parse(body);
    expect(health.storage).toEqual({ mode: "ephemeral", persistent: false });
    expect(output).toContain("Persistenz deaktiviert");
  }, 40000);

  it("nutzt node:fs (sync) fuer resolveWorkspacesDirectory — kein mkdirSync auf Promise-fs", async () => {
    const source = fsSync.readFileSync(
      path.resolve(__dirname, "..", "workspace-service", "src", "index.js"),
      "utf8",
    );
    expect(source).not.toMatch(/fs\.mkdirSync/);
    expect(source).not.toMatch(/fs\.accessSync/);
    // Sprint 73: asynchrone Aufloesung mit Timeout-Race, damit blockierende
    // Mounts (GH-Runner-/proc, read-only Container-Layer) den Start nie
    // einfrieren koennen.
    expect(source).toMatch(/raceTimeout/);
    expect(source).toMatch(/await resolveWorkspacesDirectory\(\)/);
    expect(source).toMatch(/tmpdir-Fallback/);
  });
});
