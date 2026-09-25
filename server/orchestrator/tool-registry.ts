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
import { buildVillaBlueprint, planWorkerSpawn } from "../../lib/bot-villa-logic";
import { planInfluencerCampaign } from "../../lib/influencer-reach-logic";
import { createProjectSuperagentBlueprint } from "../../lib/project-superagent-factory-logic";
import { searchRepoCode } from "../repo-chat-service";

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

/**
 * Test-Seam (Sprint 198): erlaubt Unit-Tests, den GitHub-Client zu
 * injizieren, ohne axios modulweit mocken zu muessen (isolate:false teilt
 * die Modul-Registry zwischen Testdateien — vi.mock waere dort nicht
 * deterministisch). Produktion: override bleibt null.
 */
let githubClientOverride: AxiosInstance | null = null;
export function __setGithubClientOverrideForTests(client: AxiosInstance | null): void {
  githubClientOverride = client;
}

function githubClient(): AxiosInstance | null {
  if (githubClientOverride) return githubClientOverride;
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
// GitHub-Autonomie (Sprint 198): Repo lesen, committen, Branch/PR anlegen
// und Server-Ops-Workflows dispatchen — der Superagent kann das eigene
// Control-Center-Projekt damit autonom weiterentwickeln (wie der
// Base44-Superagent-Chat). Zugriff laeuft ueber GITHUB_TOKEN ?? ADMIN_GITHUB_TOKEN.
// ---------------------------------------------------------------------------

/** Feste Allowlist dispatchbarer Server-Ops-Operationen (server-ops.yml). */
const SERVER_OPS_ALLOWLIST = new Set([
  "status",
  "probe",
  "db-check",
  "db-probe",
  "db-probe2",
  "db-migrate",
  "db-fix",
  "pm2-redeploy",
  "pm2-env-sync",
  "deploy",
  "deploy-pull",
  "env-set-github-token",
]);

function githubClientOrError(): { client: AxiosInstance } | { error: string } {
  const client = githubClient();
  if (!client) return { error: "GitHub-Client nicht initialisierbar (kein GITHUB_TOKEN/ADMIN_GITHUB_TOKEN)." };
  return { client };
}

/** Dateiinhalt base64-dekodieren (Contents-API liefert base64 oder NULL-Blob). */
function decodeContent(content: unknown): string {
  if (typeof content !== "string") return "";
  const compact = content.replace(/\n/g, "");
  try {
    return Buffer.from(compact, "base64").toString("utf-8");
  } catch {
    return "";
  }
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
    name: "git.getFileContents",
    description:
      "Liest eine Datei aus einem GitHub-Repository (Inhalt, Groesse, SHA). Bei einem Verzeichnispfad liefert es die Dateiliste. Grundlage fuer autonome Weiterentwicklung.",
    parameters: {
      type: "object",
      properties: {
        repo: { type: "string", description: "owner/name; leer = Standard-Repo" },
        path: { type: "string", description: "Repo-relativer Datei- oder Ordnerpfad" },
        branch: { type: "string", description: "Optional: Branch/Ref (leer = Default-Branch)" },
      },
      required: ["path"],
    },
    handler: async (args) =>
      guarded(async () => {
        const resolved = githubClientOrError();
        if ("error" in resolved) return { ok: false, error: resolved.error };
        const repo = String(args.repo ?? DEFAULT_REPO);
        const filePath = String(args.path ?? "").replace(/^\/+/, "");
        const branch = args.branch ? String(args.branch) : undefined;
        const response = await resolved.client.get(`/repos/${repo}/contents/${filePath}`, {
          params: branch ? { ref: branch } : undefined,
        });
        const data = response.data;
        if (Array.isArray(data)) {
          return {
            ok: true,
            result: {
              repo,
              path: filePath,
              type: "directory",
              entries: data.map((e: Record<string, unknown>) => ({ name: e.name, type: e.type, size: e.size })),
            },
          };
        }
        const text = decodeContent(data?.content);
        const tooLarge = typeof data?.size === "number" && data.size > 400_000;
        return {
          ok: true,
          result: {
            repo,
            path: filePath,
            branch: data?.git_url ? branch ?? "default" : branch,
            sha: data?.sha,
            size: data?.size,
            encoding: data?.encoding,
            content: tooLarge ? text.slice(0, 400_000) : text,
            truncated: Boolean(tooLarge),
          },
        };
      }),
  },
  {
    name: "villa.planSpawn",
    description:
      "Plant Spawn-on-Demand aus der Bot-Villa eines Projekts (Sprint 364): " +
      "waehlt passende Pool-Worker fuer eine Aufgabe. Ehrliche Grenze: " +
      "max. 24 gleichzeitig aktive Live-Worker, Pool ist Kapazitaet, kein Dauerbetrieb.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["web-app", "mobile-app", "saas", "content", "automation", "forschung"],
          description: "Projektart der Villa",
        },
        task: { type: "string", description: "Aufgabenbeschreibung, z. B. 'api-service Endpoint bauen'" },
      },
      required: ["kind", "task"],
    },
    handler: async (args) =>
      guarded(async () => {
        const villa = buildVillaBlueprint(String(args.kind ?? "web-app") as never);
        const spawn = planWorkerSpawn(villa, String(args.task ?? ""));
        return {
          ok: true,
          result: {
            workers: spawn.workers.map((worker) => `${worker.id} (${worker.specialty})`),
            liveWorkerCap: spawn.liveWorkerCap,
            note: spawn.note,
          },
        };
      }),
  },
  {
    name: "project.planSuperagent",
    description:
      "Plant einen dedizierten Projekt-Superagenten inkl. Bot-Villa (Sprint 364): " +
      "Kern-Team aus 8 Live-Workern + Pool von bis zu 5000 Worker-Definitionen, " +
      "Werkzeuge und Autonomie-Profil (HITL-Pflicht fuer Zahlungen/externe Sends). " +
      "Nur Planung — die Persistenz laeuft ueber die geschuetzte App-API.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Projektname (2-80 Zeichen)" },
        kind: {
          type: "string",
          enum: ["web-app", "mobile-app", "saas", "content", "automation", "forschung"],
          description: "Projektart",
        },
        goal: { type: "string", description: "Projektziel (3-400 Zeichen)" },
        poolSize: { type: "number", description: "Optional: Pool-Groesse bis 5000 (Default: Maximum)" },
      },
      required: ["name", "kind", "goal"],
    },
    handler: async (args) =>
      guarded(async () => {
        const blueprint = createProjectSuperagentBlueprint({
          name: String(args.name ?? ""),
          kind: String(args.kind ?? "web-app") as never,
          goal: String(args.goal ?? ""),
          poolSize: typeof args.poolSize === "number" ? args.poolSize : undefined,
        });
        return {
          ok: true,
          result: {
            superagent: blueprint.superagent,
            villa: {
              projectKind: blueprint.villa.projectKind,
              coreTeam: blueprint.villa.coreTeam.map((worker) => `${worker.id} (${worker.specialty})`),
              poolSize: blueprint.villa.pool.length,
              poolCapacity: blueprint.villa.poolCapacity,
              liveWorkerCap: blueprint.villa.liveWorkerCap,
            },
            toolGrants: blueprint.toolGrants,
            autonomy: blueprint.autonomy,
            hint: "Persistenz ueber superAgentsRouter.createFromProject (geschuetzte App-API).",
          },
        };
      }),
  },
  {
    name: "influencer.planCampaign",
    description:
      "Plant eine Influencer-Kampagne mit den 10 KI-Personas (Sprint 364): " +
      "bewertet Produkt-Nischen-Match, waehlt Fokus-/Support-Personas, Kanalmix und " +
      "Posting-Slots. Deterministisch, read-only, ohne Publishing.",
    parameters: {
      type: "object",
      properties: {
        product: { type: "string", description: "Produkt/Angebot (3-500 Zeichen)" },
        goal: { type: "string", enum: ["aufmerksamkeit", "wachstum", "umsatz"], description: "Kampagnenziel" },
        days: { type: "number", description: "Optional: Kampagnenlaenge in Tagen (1-30, Default 7)" },
      },
      required: ["product", "goal"],
    },
    handler: async (args) =>
      guarded(async () => {
        const plan = planInfluencerCampaign(String(args.product ?? ""), String(args.goal ?? "aufmerksamkeit") as never, {
          days: typeof args.days === "number" ? args.days : undefined,
        });
        return {
          ok: true,
          result: {
            focusPersona: plan.focusPersona,
            supportingPersonas: plan.supportingPersonas,
            platformMix: plan.platformMix,
            slotCount: plan.slots.length,
            slots: plan.slots.slice(0, 10),
            projectedReachIndex: plan.projectedReachIndex,
            guardrails: plan.guardrails,
          },
        };
      }),
  },
  {
    name: "repo.searchCode",
    description:
      "Durchsucht den Quellcode des GitHub-Repos (Sprint 163, V4.0 Repo Chat): " +
      "liefert Treffer mit Dateipfad und Zeilennummer (Symbolname, Pfad-Suche). " +
      "Der Index wird pro Branch gecacht; read-only, ohne confirm nutzbar.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchbegriff: Symbolname (z. B. evaluateHITLRisk) oder Pfadfragment." },
        repo: { type: "string", description: "Optional: owner/repo (Default: ORCHESTRATOR_GITHUB_REPO)." },
        branch: { type: "string", description: "Optional: Branch (Default: main)." },
      },
      required: ["query"],
    },
    handler: async (args) =>
      guarded(async () => {
        const query = String(args.query ?? "").trim();
        if (!query) return { ok: false, error: "Parameter query fehlt." };
        const response = await searchRepoCode(query, {
          repo: typeof args.repo === "string" && args.repo.trim() ? args.repo.trim() : undefined,
          branch: typeof args.branch === "string" && args.branch.trim() ? args.branch.trim() : undefined,
        });
        if (!response.ok || !response.result) {
          return { ok: false, error: response.error ?? "Code-Suche fehlgeschlagen." };
        }
        return {
          ok: true,
          result: {
            query,
            repo: response.repo,
            branch: response.branch,
            symbols: response.result.symbols.map((symbol) => ({
              kind: symbol.kind,
              name: symbol.name,
              location: `${symbol.filePath}:${symbol.line}`,
            })),
            files: response.result.files.map((file) => file.path),
          },
        };
      }),
  },
  {
    name: "git.commitFile",
    description:
      "Erstellt einen Commit in einem GitHub-Repository: legt eine Datei neu an oder aktualisiert sie (Contents-API). SHA wird automatisch ermittelt. Fuer autonome Fixes und Features.",
    parameters: {
      type: "object",
      properties: {
        repo: { type: "string", description: "owner/name; leer = Standard-Repo" },
        path: { type: "string", description: "Repo-relativer Dateipfad" },
        content: { type: "string", description: "Neuer vollstaendiger Dateiinhalt (UTF-8)" },
        message: { type: "string", description: "Commit-Nachricht (Konvention: feat/fix/chore(scope): ...)" },
        branch: { type: "string", description: "Optional: Ziel-Branch (leer = Default-Branch)" },
      },
      required: ["path", "content", "message"],
    },
    handler: async (args) =>
      guarded(async () => {
        const resolved = githubClientOrError();
        if ("error" in resolved) return { ok: false, error: resolved.error };
        const client = resolved.client;
        const repo = String(args.repo ?? DEFAULT_REPO);
        const filePath = String(args.path ?? "").replace(/^\/+/, "");
        const message = String(args.message ?? "").trim();
        if (!filePath || !message) return { ok: false, error: "Pfad und Commit-Nachricht sind erforderlich." };
        const branch = args.branch ? String(args.branch) : undefined;
        // Aktuellen Stand holen (SHA der Datei, falls vorhanden) — sonst Anlage.
        let sha: string | undefined;
        try {
          const current = await client.get(`/repos/${repo}/contents/${filePath}`, {
            params: branch ? { ref: branch } : undefined,
          });
          if (Array.isArray(current.data)) return { ok: false, error: `"${filePath}" ist ein Verzeichnis."` };
          sha = current.data?.sha;
        } catch (e) {
          // 404 = Datei existiert noch nicht -> neuer Commit ohne SHA.
          if (!(e && typeof e === "object" && "response" in e && (e as { response?: { status?: number } }).response?.status === 404)) {
            throw e;
          }
        }
        const response = await client.put(`/repos/${repo}/contents/${filePath}`, {
          message,
          content: Buffer.from(String(args.content ?? ""), "utf-8").toString("base64"),
          branch,
          sha,
        });
        return {
          ok: true,
          result: {
            repo,
            path: filePath,
            branch: branch ?? "default",
            commit: (response.data?.commit?.sha ?? "").slice(0, 7),
            htmlUrl: response.data?.content?.html_url,
            created: !sha,
          },
        };
      }),
  },
  {
    name: "git.createBranch",
    description:
      "Erstellt einen neuen Branch in einem GitHub-Repository (ab Default-Branch oder explizitem Basis-Branch). Fuer parallele Entwicklungsstränge.",
    parameters: {
      type: "object",
      properties: {
        repo: { type: "string", description: "owner/name; leer = Standard-Repo" },
        branchName: { type: "string", description: "Neuer Branch-Name (z. B. agent/neue-funktion)" },
        fromBranch: { type: "string", description: "Optional: Basis-Branch (leer = Default-Branch)" },
      },
      required: ["branchName"],
    },
    handler: async (args) =>
      guarded(async () => {
        const resolved = githubClientOrError();
        if ("error" in resolved) return { ok: false, error: resolved.error };
        const client = resolved.client;
        const repo = String(args.repo ?? DEFAULT_REPO);
        const branchName = String(args.branchName ?? "").trim();
        if (!branchName || /[\^~:\\]/.test(branchName) || branchName.startsWith("-")) {
          return { ok: false, error: "Ungueltiger Branch-Name." };
        }
        let fromRef = args.fromBranch ? String(args.fromBranch) : undefined;
        if (!fromRef) {
          const repoResponse = await client.get(`/repos/${repo}`);
          fromRef = repoResponse.data?.default_branch ?? "main";
        }
        const refResponse = await client.get(`/repos/${repo}/git/ref/heads/${fromRef}`);
        await client.post(`/repos/${repo}/git/refs`, {
          ref: `refs/heads/${branchName}`,
          sha: refResponse.data?.object?.sha,
        });
        return { ok: true, result: { repo, branch: branchName, from: fromRef } };
      }),
  },
  {
    name: "git.createPullRequest",
    description:
      "Erstellt einen Pull-Request in einem GitHub-Repository. Kopf-Branch muss bereits gepusht sein (z. B. via git.commitFile auf diesem Branch).",
    parameters: {
      type: "object",
      properties: {
        repo: { type: "string", description: "owner/name; leer = Standard-Repo" },
        title: { type: "string" },
        head: { type: "string", description: "Branch mit den Aenderungen" },
        base: { type: "string", description: "Ziel-Branch (leer = Default-Branch)" },
        body: { type: "string", description: "Optionale PR-Beschreibung (Markdown)" },
      },
      required: ["title", "head"],
    },
    handler: async (args) =>
      guarded(async () => {
        const resolved = githubClientOrError();
        if ("error" in resolved) return { ok: false, error: resolved.error };
        const client = resolved.client;
        const repo = String(args.repo ?? DEFAULT_REPO);
        const base = args.base ? String(args.base) : (await client.get(`/repos/${repo}`)).data?.default_branch ?? "main";
        const response = await client.post(`/repos/${repo}/pulls`, {
          title: String(args.title ?? "").trim(),
          head: String(args.head ?? ""),
          base,
          body: args.body ? String(args.body) : undefined,
        });
        return {
          ok: true,
          result: { repo, number: response.data?.number, url: response.data?.html_url, base, head: response.data?.head?.ref },
        };
      }),
  },
  {
    name: "git.dispatchServerOps",
    description:
      "Loest eine feste Server-Ops-Operation ueber den GitHub-Actions-Workflow aus (z. B. status, db-migrate, deploy, pm2-redeploy). Nur Operationen aus der Allowlist.",
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          description: "Operation aus der Allowlist: status, probe, db-check, db-probe, db-probe2, db-migrate, db-fix, pm2-redeploy, pm2-env-sync, deploy, deploy-pull, env-set-github-token",
          enum: [...SERVER_OPS_ALLOWLIST],
        },
      },
      required: ["operation"],
    },
    handler: async (args) =>
      guarded(async () => {
        const resolved = githubClientOrError();
        if ("error" in resolved) return { ok: false, error: resolved.error };
        const operation = String(args.operation ?? "").trim();
        if (!SERVER_OPS_ALLOWLIST.has(operation)) {
          return { ok: false, error: `Operation "${operation}" ist nicht freigegeben.` };
        }
        await resolved.client.post(
          `/repos/${DEFAULT_REPO}/actions/workflows/server-ops.yml/dispatches`,
          { ref: "main", inputs: { operation } },
        );
        return {
          ok: true,
          result: { repo: DEFAULT_REPO, workflow: "server-ops.yml", operation, dispatched: true, note: "Lauf folgt asynchron — Ergebnis via git.repoStatus oder Actions-Logs pruefbar." },
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
