import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  executeTool,
  getToolDefinitions,
  newTraceId,
} from "@/server/orchestrator/tool-registry";

/**
 * Sprint 377 — Sicherheits- und Fehlervertrag des Orchestrator-Tool-Registry.
 *
 * Die Git-/GitHub-Tools sind in `tests/tool-registry-git-tools.test.ts`
 * abgedeckt. Hier stehen die uebrigen Schichten, die den Superagenten
 * begrenzen: Allowlist (unbekannte Tools), Bestaetigungspflicht fuer
 * destruktive Operationen, die zweite HITL-Sicherheitsschicht sowie der
 * sandgeboxte Dateisystem-Zugriff (Path-Traversal).
 *
 * Kein Netzwerk: alle hier geprueften Pfade enden vor einem HTTP-Aufruf
 * (blockiert) oder an einer fehlenden Konfiguration.
 */

const SANDBOX_ROOT = path.join(os.tmpdir(), "cybersarah-orchestrator-workspace");
const TEST_DIR = `sprint377-${process.pid}-${Date.now().toString(36)}`;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {
    HETZNER_CLOUD_TOKEN: process.env.HETZNER_CLOUD_TOKEN,
    DOCKER_API_URL: process.env.DOCKER_API_URL,
  };
  delete process.env.HETZNER_CLOUD_TOKEN;
  delete process.env.DOCKER_API_URL;
});

afterEach(async () => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await fsp.rm(path.join(SANDBOX_ROOT, TEST_DIR), { recursive: true, force: true });
});

describe("executeTool — Allowlist", () => {
  it("lehnt unbekannte Tools ab und nennt die verfuegbaren", async () => {
    const result = await executeTool("shell.run", { command: "rm -rf /" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unbekanntes Tool "shell.run"');
    expect(result.error).toContain("git.repoStatus");
    expect(result.result).toBeUndefined();
  });

  it("veroeffentlicht nur Tool-Definitionen ohne Handler", () => {
    const definitions = getToolDefinitions();
    expect(definitions.length).toBeGreaterThan(10);
    for (const definition of definitions) {
      expect(definition.type).toBe("function");
      expect(typeof definition.function.name).toBe("string");
      expect(typeof definition.function.description).toBe("string");
      expect(definition.function.parameters).toMatchObject({ type: "object" });
      expect(definition).not.toHaveProperty("handler");
    }
    const names = definitions.map((definition) => definition.function.name);
    expect(names).toContain("git.commitFile");
    expect(names).toContain("fs.writeWorkspaceFile");
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("executeTool — Bestaetigungspflicht fuer destruktive Operationen", () => {
  it("blockt docker.restartContainer ohne confirm=true", async () => {
    const result = await executeTool("docker.restartContainer", { containerId: "abc" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("erfordert eine explizite Bestaetigung");
    expect(result.error).toContain("confirm=true");
  });

  it("akzeptiert nur den echten Boolean true, keine Strings", async () => {
    const result = await executeTool("docker.restartContainer", {
      containerId: "abc",
      confirm: "true",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("erfordert eine explizite Bestaetigung");
  });

  it("laesst bestaetigte Aufrufe bis zur Konfigurationspruefung durch", async () => {
    const result = await executeTool("docker.restartContainer", {
      containerId: "abc",
      confirm: true,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("DOCKER_API_URL ist nicht konfiguriert.");
  });

  it("verlangt die Bestaetigung auch beim Server-Reboot", async () => {
    const ohneConfirm = await executeTool("hetzner.rebootServer", { serverId: 42 });
    expect(ohneConfirm.ok).toBe(false);
    expect(ohneConfirm.error).toContain("confirm=true");

    const mitConfirm = await executeTool("hetzner.rebootServer", { serverId: 42, confirm: true });
    expect(mitConfirm.ok).toBe(false);
    expect(mitConfirm.error).toBe("HETZNER_CLOUD_TOKEN ist nicht konfiguriert.");
  });
});

describe("executeTool — zweite HITL-Sicherheitsschicht", () => {
  it("blockt kritische Kommandos auch bei nicht als destruktiv markierten Tools", async () => {
    const result = await executeTool("git.dispatchServerOps", {
      operation: "status",
      command: "sudo reboot",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("HITL OPERATOR_CONFIRM_REQUIRED");
    expect(result.error).toContain("Operator-Bestaetigung erforderlich");
    expect(result.result).toBeUndefined();
  });

  it("blockt auch Shell-Zugriffe auf SSH-Schluessel", async () => {
    const result = await executeTool("git.dispatchServerOps", {
      operation: "probe",
      command: "cat ~/.ssh/id_rsa",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("HITL OPERATOR_CONFIRM_REQUIRED");
  });
});

describe("Hetzner/Docker ohne Konfiguration", () => {
  it("meldet fehlendes HETZNER_CLOUD_TOKEN ehrlich", async () => {
    const result = await executeTool("hetzner.listServers");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("HETZNER_CLOUD_TOKEN ist nicht konfiguriert.");
  });

  it("meldet fehlende DOCKER_API_URL ehrlich", async () => {
    for (const [tool, args] of [
      ["docker.containers", {}],
      ["docker.containerLogs", { containerId: "abc", lines: 10 }],
    ] as const) {
      const result = await executeTool(tool, args);
      expect(result.ok).toBe(false);
      expect(result.error).toBe("DOCKER_API_URL ist nicht konfiguriert.");
    }
  });
});

describe("Sandbox-Dateisystem", () => {
  it("blockt Path-Traversal per relativer Flucht", async () => {
    const result = await executeTool("fs.writeWorkspaceFile", {
      path: "../ausbruch.txt",
      content: "nein",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Ungueltiger Pfad (Path-Traversal blockiert).");
  });

  it("blockt absolute Pfade ausserhalb des Sandbox-Ordners", async () => {
    for (const tool of ["fs.writeWorkspaceFile", "fs.readWorkspaceFile"]) {
      const result = await executeTool(tool, { path: "/etc/passwd", content: "x" });
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Ungueltiger Pfad (Path-Traversal blockiert).");
    }
  });

  it("schreibt und liest Dateien innerhalb des Sandbox-Ordners", async () => {
    const relative = `${TEST_DIR}/unterordner/notiz.txt`;
    const written = await executeTool("fs.writeWorkspaceFile", {
      path: relative,
      content: "Hallo Sandbox",
    });
    expect(written.ok).toBe(true);
    expect(written.result).toMatchObject({
      written: `/${relative}`,
      bytes: "Hallo Sandbox".length,
    });

    const read = await executeTool("fs.readWorkspaceFile", { path: relative });
    expect(read.ok).toBe(true);
    expect(read.result).toEqual({ content: "Hallo Sandbox" });
  });

  it("liefert fuer fehlende Dateien einen Fehler statt einer Exception", async () => {
    const result = await executeTool("fs.readWorkspaceFile", {
      path: `${TEST_DIR}/gibt-es-nicht.txt`,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("ENOENT");
  });

  it("listet den Workspace ohne Fehler und enthaelt geschriebene Dateien", async () => {
    const leer = await executeTool("fs.listWorkspace");
    expect(leer.ok).toBe(true);
    expect(Array.isArray((leer.result as { files: string[] }).files)).toBe(true);

    const relative = `${TEST_DIR}/sichtbar.txt`;
    await executeTool("fs.writeWorkspaceFile", { path: relative, content: "da" });
    const liste = await executeTool("fs.listWorkspace");
    expect(liste.ok).toBe(true);
    const files = (liste.result as { files: string[] }).files.map(String);
    expect(files.some((file) => file.endsWith(path.join(TEST_DIR, "sichtbar.txt")))).toBe(true);
  });
});

describe("newTraceId", () => {
  it("liefert eindeutige UUIDs", () => {
    const first = newTraceId();
    const second = newTraceId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(first).not.toBe(second);
  });
});
