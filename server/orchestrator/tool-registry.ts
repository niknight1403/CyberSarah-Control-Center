/**
 * Orchestrator-Tool-Registry (Sprint 123).
 *
 * Sichere, allowlist-basierte Funktions-Registry fuer den Leitenden
 * Superagenten. Jedes Tool ist ueber ein striktes JSON-Schema beschrieben,
 * hat ein Zeitlimit und gibt niemals ungefangene Exceptions an die LLM-Loop
 * weiter — stattdessen strukturierte { ok, result | error }-Antworten, die
 * der Superagent zur Selbstkorrektur auswerten kann.
 *
 * Enthaltene Schnittstellen:
 *   - Hetzner Cloud API (Server-Verwaltung, Health-Status)
 *   - Docker Remote API (Container-Management; optional via DOCKER_API_URL)
 *   - Git/GitHub (Repo-Status, Branches, Commits)
 *   - Sichere Dateisystem-Operationen (sandgeboxt auf einen Temp-Workspace)
 *
 * Sicherheit:
 *   - Destruktive Operationen (reboot/restart) verlangen ein explizites
 *     Bestaetigungs-Flag (`confirm: true`) im Aufruf.
 *   - Dateisystem-Zugriffe sind auf den Sandbox-Ordner beschränkt
 *     (Path-Traversal wird blockiert).
 */

import { create, type AxiosInstance } from "axios";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

import { evaluateHITLRisk } from "../../lib/hitl-guard-logic";

export interface ToolResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON-Schema der Parameter (OpenAI function-calling Format). */
  parameters: Record<string, unknown>;
  /** true = destruktiv, erfordert confirm: true im Aufruf. */
  requiresConfirmation?: boolean;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

const DEFAULT_REPO = process.env.ORCHESTRATOR_GITHUB_REPO ?? "niknight1403/CyberSarah-Control-Center";
const HETZNER_API = "https://api.hetzner.cloud/v1";
const TOOL_TIMEOUT_MS = 15_000;
const SANDBOX_ROOT = path.join(os.tmpdir(), "cybersarah-orchestrator-workspace");

/** HTTP-Clients pro Backend (lazy, mit Zeitlimit). */
function hetznerClient(): AxiosInstance | null {
  const token = process.env.HETZNER_CLOUD_TOKEN;
  if (!token) return null;
  return create({
    baseURL: HETZNER_API,
    timeout: TOOL_TIMEOUT_MS,
    headers: { Authorization: `Bearer ${token}` },
  });
}

function dockerClient(): AxiosInstance | null {
  const baseUrl = process.env.DOCKER_API_URL;
  if (!baseUrl) return null;
  return create({ baseURL: baseUrl.replace(/\/$/, ""), timeout: TOOL_TIMEOUT_MS });
}

function githubClient(): AxiosInstance | null {
  const token = process.env.GITHUB_TOKEN ?? process.env.ADMIN_GITHUB_TOKEN;
  return create({
    baseURL: "https://api.github.com",
    timeout: TOOL_TIMEOUT_MS,
    headers: token
      ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
      : { Accept: "application/vnd.github+json" },
  });
}

async function guarded(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

function requireConfirmation(tool: ToolSpec, args: Record<string, unknown>): ToolResult | null {
  if (tool.requiresConfirmation && args.confirm !== true) {
    return {
      ok: false,
      error: `Destruktive Operation "${tool.name}" erfordert eine explizite Bestaetigung: Parameter confirm=true setzen.`,
    };
  }
  return null;
}

function sandboxPath(relative: string): string | null {
  const resolved = path.resolve(SANDBOX_ROOT, relative);
  if (!resolved.startsWith(SANDBOX_ROOT + path.sep) && resolved !== SANDBOX_ROOT) return null;
  return resolved;
}

// ---------------------------------------------------------------------------
// Tool-Definitionen
// ---------------------------------------------------------------------------

const tools: ToolSpec[] = [
  {
    name: "hetzner.listServers",
    description: "Listet alle Hetzner-Cloud-Server mit Status, IP-Adresse und Labels auf.",
    parameters: { type: "object", properties: {}, required: [] },
    handler: async () =>
      guarded(async () => {
        const client = hetznerClient();
        if (!client) return { ok: false, error: "HETZNER_CLOUD_TOKEN ist nicht konfiguriert." };
        const response = await client.get("/servers");
        const servers = (response.data?.servers ?? []).map((s: Record<string, unknown>) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          publicIp: (s.public_net as Record<string, unknown> | undefined)?.ipv4,
        }));
        return { ok: true, result: { servers } };
      }),
  },
  {
    name: "hetzner.rebootServer",
    description: "Fuehrt einen Soft-Reboot eines Hetzner-Servers aus. Destruktiv: benoetigt confirm=true.",
    parameters: {
      type: "object",
      properties: { serverId: { type: "number" }, confirm: { type: "boolean" } },
      required: ["serverId"],
    },
    requiresConfirmation: true,
    handler: async (args) =>
      guarded(async () => {
        const client = hetznerClient();
        if (!client) return { ok: false, error: "HETZNER_CLOUD_TOKEN ist nicht konfiguriert." };
        await client.post(`/servers/${args.serverId}/actions/reboot`);
        return { ok: true, result: { rebooted: true, serverId: args.serverId } };
      }),
  },
  {
    name: "docker.containers",
    description: "Listet alle Container eines remote Docker-Hosts (DOCKER_API_URL) mit Status.",
    parameters: { type: "object", properties: { all: { type: "boolean" } }, required: [] },
    handler: async (args) =>
      guarded(async () => {
        const client = dockerClient();
        if (!client) return { ok: false, error: "DOCKER_API_URL ist nicht konfiguriert." };
        const response = await client.get("/containers/json", { params: { all: args.all !== false ? 1 : 0 } });
        const containers = (response.data ?? []).map((c: Record<string, unknown>) => ({
          id: c.Id,
          name: Array.isArray(c.Names) ? c.Names[0] : null,
          state: c.State,
          status: c.Status,
        }));
        return { ok: true, result: { containers } };
      }),
  },
  {
    name: "docker.containerLogs",
    description: "Liest die letzten Log-Zeilen eines Docker-Containers (Docker Remote API).",
    parameters: {
      type: "object",
      properties: { containerId: { type: "string" }, lines: { type: "number" } },
      required: ["containerId"],
    },
    handler: async (args) =>
      guarded(async () => {
        const client = dockerClient();
        if (!client) return { ok: false, error: "DOCKER_API_URL ist nicht konfiguriert." };
        const response = await client.get(`/containers/${args.containerId}/logs`, {
          params: { stdout: 1, stderr: 1, tail: Number(args.lines ?? 100) },
          responseType: "text",
          transformResponse: [(data: unknown) => data],
        });
        return { ok: true, result: { logs: String(response.data).split("\n").slice(-Number(args.lines ?? 100)) } };
      }),
  },
  {
    name: "docker.restartContainer",
    description: "Startet einen Docker-Container neu. Destruktiv: benoetigt confirm=true.",
    parameters: {
      type: "object",
      properties: { containerId: { type: "string" }, confirm: { type: "boolean" } },
      required: ["containerId"],
    },
    requiresConfirmation: true,
    handler: async (args) =>
      guarded(async () => {
        const client = dockerClient();
        if (!client) return { ok: false, error: "DOCKER_API_URL ist nicht konfiguriert." };
        await client.post(`/containers/${args.containerId}/restart`);
        return { ok: true, result: { restarted: true, containerId: args.containerId } };
      }),
  },
  {
    name: "git.repoStatus",
    description: "Liefert GitHub-Repo-Status: Standard-Branch, letzte Commits, offene Pull Requests.",
    parameters: {
      type: "object",
      properties: { repo: { type: "string" } },
      required: [],
    },
    handler: async (args) =>
      guarded(async () => {
        const client = githubClient();
        if (!client) return { ok: false, error: "GitHub-Client nicht initialisierbar." };
        const repo = String(args.repo ?? DEFAULT_REPO);
        const [repoResponse, commitsResponse] = await Promise.all([
          client.get(`/repos/${repo}`),
          client.get(`/repos/${repo}/commits`, { params: { per_page: 5 } }),
        ]);
        return {
          ok: true,
          result: {
            repo,
            defaultBranch: repoResponse.data?.default_branch,
            pushedAt: repoResponse.data?.pushed_at,
            recentCommits: (commitsResponse.data ?? []).map((c: Record<string, unknown>) => ({
              sha: String(c.sha ?? "").slice(0, 7),
              message: String((c.commit as Record<string, unknown> | undefined)?.message ?? ""),
            })),
          },
        };
      }),
  },
  {
    name: "git.listBranches",
    description: "Listet die Branches eines GitHub-Repositories auf.",
    parameters: { type: "object", properties: { repo: { type: "string" } }, required: [] },
    handler: async (args) =>
      guarded(async () => {
        const client = githubClient();
        if (!client) return { ok: false, error: "GitHub-Client nicht initialisierbar." };
        const repo = String(args.repo ?? DEFAULT_REPO);
        const response = await client.get(`/repos/${repo}/branches`, { params: { per_page: 50 } });
        return {
          ok: true,
          result: { repo, branches: (response.data ?? []).map((b: Record<string, unknown>) => b.name) },
        };
      }),
  },
  {
    name: "fs.writeWorkspaceFile",
    description: "Schreibt Text/JSON in eine Datei im sandgeboxten Orchestrator-Workspace.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
    handler: async (args) =>
      guarded(async () => {
        const target = sandboxPath(String(args.path ?? ""));
        if (!target) return { ok: false, error: "Ungueltiger Pfad (Path-Traversal blockiert)." };
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, String(args.content ?? ""), "utf-8");
        return { ok: true, result: { written: target.replace(SANDBOX_ROOT, ""), bytes: String(args.content ?? "").length } };
      }),
  },
  {
    name: "fs.readWorkspaceFile",
    description: "Liest eine Datei aus dem sandgeboxten Orchestrator-Workspace.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    handler: async (args) =>
      guarded(async () => {
        const target = sandboxPath(String(args.path ?? ""));
        if (!target) return { ok: false, error: "Ungueltiger Pfad (Path-Traversal blockiert)." };
        const content = await fs.readFile(target, "utf-8");
        return { ok: true, result: { content } };
      }),
  },
  {
    name: "fs.listWorkspace",
    description: "Listet den Inhalt des sandgeboxten Orchestrator-Workspaces auf.",
    parameters: { type: "object", properties: {}, required: [] },
    handler: async () =>
      guarded(async () => {
        try {
          const entries = await fs.readdir(SANDBOX_ROOT, { recursive: true });
          return { ok: true, result: { files: entries.map(String) } };
        } catch {
          return { ok: true, result: { files: [] } };
        }
      }),
  },
];

const registry = new Map<string, ToolSpec>(tools.map((tool) => [tool.name, tool]));

/** Alle Tools im OpenAI function-calling Format. */
export function getToolDefinitions(): { type: "function"; function: Record<string, unknown> }[] {
  return [...registry.values()].map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/** Tool ueber die Allowlist ausfuehren — niemals ungefangene Exceptions. */
export async function executeTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const tool = registry.get(name);
  if (!tool) {
    return { ok: false, error: `Unbekanntes Tool "${name}" — verfuegbar: ${[...registry.keys()].join(", ")}` };
  }
  const confirmationError = requireConfirmation(tool, args);
  if (confirmationError) return confirmationError;

  // HITL-Guardrail (Sprint 161): Zweite Safety-Schicht nach der Registry-
  // Allowlist. Bewertung ueber die zentrale Risiko-Logik — bei
  // OPERATOR_CONFIRM_REQUIRED blockiert der Aufruf, bis der Operator ihn
  // mit confirm=true dokumentiert bestaetigt.
  const hitlAssessment = evaluateHITLRisk(tool.name, args);
  if (hitlAssessment.requiresConfirmation && args.confirm !== true) {
    return {
      ok: false,
      error:
        `HITL ${hitlAssessment.status} (${hitlAssessment.category}): ${hitlAssessment.reason} ` +
        `Operator-Bestaetigung erforderlich — Parameter confirm=true setzen.`,
    };
  }
  return tool.handler(args);
}

/** Eindeutige Id fuer externe Referenzen (z. B. tRPC-Trace-Korrelation). */
export function newTraceId(): string {
  return randomUUID();
}
