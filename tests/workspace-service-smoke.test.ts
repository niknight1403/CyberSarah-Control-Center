import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fsSync from "node:fs";

/**
 * Sprint-73-Regressionstest: Der Workspace-Service crashte auf Render beim Start,
 * weil resolveWorkspacesDirectory fs.mkdirSync auf dem Promise-fs-Import aufrief
 * (node:fs/promises kennt keine synchronen Funktionen) und in den Fallback-Zweig
 * lief, sobald WORKSPACES_DIR nicht beschreibbar ist (Render: read-only /app).
 * Dieser Smoke-Test startet den Service mit unbeschreibbarem WORKSPACES_DIR und
 * erwartet, dass er trotzdem sauber hochfaehrt.
 */
describe("workspace-service startup smoke (Sprint 73)", () => {
  it("startet auch mit unbeschreibbarem WORKSPACES_DIR (Fallback statt Crash)", async () => {
    const serviceDir = path.resolve(__dirname, "..", "workspace-service");
    expect(fsSync.existsSync(path.join(serviceDir, "src", "index.js"))).toBe(true);

    const port = 18787 + Math.floor(Math.random() * 2000);
    const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
      const child = spawn(
        process.execPath,
        ["src/index.js"],
        {
          cwd: serviceDir,
          env: {
            ...process.env,
            PORT: String(port),
            WORKSPACES_DIR: "/proc/cybersarah-unwritable", // provozierter Fallback-Zweig
            NODE_ENV: "production",
          },
        },
      );
      let output = "";
      // CI-Runner sind unter paralleler Krypto-Last langsam beim Kaltstart —
      // grosszuegiger Timeout, damit kein false negative entsteht.
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({ code: null, output });
      }, 20000);
      child.stdout?.on("data", (chunk) => {
        output += String(chunk);
        if (output.includes("listening on")) {
          clearTimeout(timer);
          child.kill("SIGKILL");
          resolve({ code: null, output });
        }
      });
      child.stderr?.on("data", (chunk) => {
        output += String(chunk);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ code: -1, output: output + `\n[spawn-error] ${error.message}` });
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve({ code, output });
      });
    });

    if (result.code === 0 || result.code === null) {
      expect(result.output, `kein 'listening on' im Output nach 20s:\n${result.output}`).toContain("listening on");
    } else {
      throw new Error(`Workspace-Service crashte beim Start (exit ${result.code}):\n${result.output}`);
    }
  }, 40000);

  it("nutzt node:fs (sync) fuer resolveWorkspacesDirectory — kein mkdirSync auf Promise-fs", async () => {
    const source = fsSync.readFileSync(
      path.resolve(__dirname, "..", "workspace-service", "src", "index.js"),
      "utf8",
    );
    expect(source).toMatch(/import fsSync from "node:fs"/);
    expect(source).not.toMatch(/fs\.mkdirSync/);
    expect(source).not.toMatch(/fs\.accessSync/);
    expect(os.platform()).toBeDefined();
  });
});
