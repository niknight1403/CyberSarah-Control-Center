import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import cors from "cors";
import express from "express";
import httpProxy from "http-proxy";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const port = Number(process.env.PORT ?? 8787);
const workspacesDirectory = path.resolve(process.env.WORKSPACES_DIR ?? "/data/workspaces");
const publicBaseUrl = (process.env.PREVIEW_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
const serviceAccessToken = process.env.SERVICE_ACCESS_TOKEN ?? "";
const allowedOrigin = process.env.ALLOWED_ORIGIN ?? "";
const runtimes = new Map();
const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });

const repositorySchema = z.object({
  repositoryUrl: z.string().url(),
  branch: z.string().min(1).max(120).default("main"),
});
const workspaceIdSchema = z.string().regex(/^[a-z0-9-]+$/);
const fileWriteSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(1_000_000),
});
const commitSchema = z.object({ message: z.string().min(1).max(240) });
const agentSchema = z.object({
  workspaceId: workspaceIdSchema,
  prompt: z.string().min(1).max(8_000),
  activeFile: z.string().max(500).optional(),
});

function isServiceAuthorized(request) {
  if (!serviceAccessToken) return process.env.NODE_ENV !== "production";
  const supplied = request.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (supplied.length !== serviceAccessToken.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(serviceAccessToken));
}

function requireServiceAuthorization(request, response, next) {
  if (!isServiceAuthorized(request)) {
    return response.status(401).json({ error: "Workspace-Service-Zugriff verweigert." });
  }
  return next();
}

function getGitHubToken(request) {
  const token = request.header("X-GitHub-Token")?.trim();
  return token || undefined;
}

function assertRepositoryUrl(repositoryUrl) {
  const parsed = new URL(repositoryUrl);
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
    throw new Error("Es sind nur HTTPS-Repository-URLs von github.com zulässig.");
  }
  const parts = parsed.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/").filter(Boolean);
  if (parts.length !== 2) throw new Error("Die Repository-URL muss owner/repository enthalten.");
  return { owner: parts[0], repository: parts[1] };
}

function workspaceIdFor(repositoryUrl) {
  const { owner, repository } = assertRepositoryUrl(repositoryUrl);
  return `${owner}-${repository}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function getWorkspacePath(workspaceId) {
  const parsed = workspaceIdSchema.safeParse(workspaceId);
  if (!parsed.success) throw new Error("Ungültige Workspace-ID.");
  const candidate = path.resolve(workspacesDirectory, parsed.data);
  if (!candidate.startsWith(`${workspacesDirectory}${path.sep}`)) throw new Error("Ungültiger Workspace-Pfad.");
  return candidate;
}

function getSafeProjectPath(workspaceId, relativePath) {
  const workspacePath = getWorkspacePath(workspaceId);
  const candidate = path.resolve(workspacePath, relativePath);
  if (!candidate.startsWith(`${workspacePath}${path.sep}`)) throw new Error("Dateipfad liegt außerhalb des Workspace.");
  return candidate;
}

async function git(argumentsList, cwd, token) {
  const args = token
    ? ["-c", `http.extraHeader=Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`, ...argumentsList]
    : argumentsList;
  try {
    return await execFileAsync("git", args, { cwd, maxBuffer: 2_000_000 });
  } catch (error) {
    const stderr = error instanceof Error && "stderr" in error ? String(error.stderr ?? "") : "";
    const sanitized = token ? stderr.replaceAll(token, "[REDACTED]") : stderr;
    throw new Error(`Git-Operation fehlgeschlagen.${sanitized ? ` ${sanitized.trim()}` : ""}`);
  }
}

async function ensureWorkspace(repositoryUrl, branch, token) {
  const workspaceId = workspaceIdFor(repositoryUrl);
  const workspacePath = getWorkspacePath(workspaceId);
  const gitPath = path.join(workspacePath, ".git");
  const exists = await fs.stat(gitPath).then(() => true).catch(() => false);

  if (!exists) {
    await fs.mkdir(workspacesDirectory, { recursive: true });
    await git(["clone", "--branch", branch, "--single-branch", repositoryUrl, workspacePath], workspacesDirectory, token);
  } else {
    await git(["fetch", "origin", branch], workspacePath, token);
    await git(["checkout", "-B", branch, `origin/${branch}`], workspacePath, token);
  }
  return { workspaceId, workspacePath };
}

async function listFiles(directory, baseDirectory = directory, entries = []) {
  const children = await fs.readdir(directory, { withFileTypes: true });
  for (const child of children) {
    if ([".git", "node_modules", ".next", "dist", "build"].includes(child.name)) continue;
    const absolutePath = path.join(directory, child.name);
    const relativePath = path.relative(baseDirectory, absolutePath).replaceAll(path.sep, "/");
    if (child.isDirectory()) await listFiles(absolutePath, baseDirectory, entries);
    if (child.isFile()) entries.push(relativePath);
    if (entries.length >= 1_500) return entries;
  }
  return entries;
}

function attachRuntimeOutput(runtime, chunk) {
  runtime.output = `${runtime.output}${chunk}`.slice(-24_000);
  const portMatch = chunk.match(/(?:localhost|127\.0\.0\.1):([0-9]{2,5})/);
  if (portMatch) runtime.port = Number(portMatch[1]);
}

async function stopRuntime(workspaceId) {
  const runtime = runtimes.get(workspaceId);
  if (!runtime) return;
  runtime.process.kill("SIGTERM");
  runtimes.delete(workspaceId);
}

function buildAgentMessages(snapshot, input) {
  const context = snapshot
    .map(({ file, content }) => `--- ${file} ---\n${content.slice(0, 9_000)}`)
    .join("\n\n");
  return [
    {
      role: "system",
      content: "You are a senior software engineer. Return strict JSON with the keys summary, patch, affectedFiles. Do not mutate files. The patch must be a concise unified diff.",
    },
    {
      role: "user",
      content: `Request: ${input.prompt}\nActive file: ${input.activeFile ?? "not specified"}\n\nProject files:\n${context}`,
    },
  ];
}

async function invokeProvider(request, messages) {
  const provider = request.header("X-AI-Provider") ?? "managed";
  const suppliedKey = request.header("X-AI-Provider-Key")?.trim();
  const defaults = {
    managed: { baseUrl: process.env.MANAGED_LLM_BASE_URL, key: process.env.MANAGED_LLM_API_KEY, model: process.env.MANAGED_LLM_MODEL ?? "gpt-4o-mini" },
    openai: { baseUrl: "https://api.openai.com/v1/chat/completions", key: suppliedKey, model: process.env.OPENAI_MODEL ?? "gpt-4o-mini" },
    groq: { baseUrl: "https://api.groq.com/openai/v1/chat/completions", key: suppliedKey, model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile" },
    together: { baseUrl: "https://api.together.xyz/v1/chat/completions", key: suppliedKey, model: process.env.TOGETHER_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
    anthropic: { baseUrl: "https://api.anthropic.com/v1/messages", key: suppliedKey, model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest" },
  };
  const configuration = defaults[provider];
  if (!configuration?.baseUrl || !configuration.key) throw new Error("Für das ausgewählte KI-Profil fehlt ein API-Key oder eine On-Server-Konfiguration.");

  const isAnthropic = provider === "anthropic";
  const response = await fetch(configuration.baseUrl, {
    method: "POST",
    headers: isAnthropic
      ? { "content-type": "application/json", "x-api-key": configuration.key, "anthropic-version": "2023-06-01" }
      : { "content-type": "application/json", authorization: `Bearer ${configuration.key}` },
    body: JSON.stringify(
      isAnthropic
        ? { model: configuration.model, max_tokens: 1_800, system: messages[0].content, messages: messages.slice(1) }
        : { model: configuration.model, temperature: 0.2, response_format: { type: "json_object" }, messages },
    ),
  });
  if (!response.ok) throw new Error(`KI-Provider antwortet mit ${response.status}.`);
  const payload = await response.json();
  const content = isAnthropic ? payload.content?.[0]?.text : payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Der KI-Provider hat keinen Vorschlag zurückgegeben.");
  try {
    return JSON.parse(content);
  } catch {
    return { summary: content, patch: "", affectedFiles: [] };
  }
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || !allowedOrigin || origin === allowedOrigin) return callback(null, true);
      return callback(new Error("Origin ist nicht erlaubt."));
    },
    allowedHeaders: ["Authorization", "Content-Type", "X-GitHub-Token", "X-AI-Provider", "X-AI-Provider-Key"],
  }),
);

app.get("/api/v1/health", requireServiceAuthorization, (_request, response) => {
  response.json({ status: "ready", version: "1.0.0", previewUrl: publicBaseUrl || undefined });
});

app.post("/api/v1/repositories/attach", requireServiceAuthorization, async (request, response, next) => {
  try {
    const input = repositorySchema.parse(request.body);
    const workspace = await ensureWorkspace(input.repositoryUrl, input.branch, getGitHubToken(request));
    const files = await listFiles(workspace.workspacePath);
    response.status(201).json({ workspaceId: workspace.workspaceId, branch: input.branch, files });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/workspaces/:workspaceId/files", requireServiceAuthorization, async (request, response, next) => {
  try {
    const files = await listFiles(getWorkspacePath(request.params.workspaceId));
    response.json({ files });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/workspaces/:workspaceId/file", requireServiceAuthorization, async (request, response, next) => {
  try {
    const relativePath = z.string().min(1).parse(request.query.path);
    const content = await fs.readFile(getSafeProjectPath(request.params.workspaceId, relativePath), "utf8");
    response.json({ path: relativePath, content });
  } catch (error) {
    next(error);
  }
});

app.put("/api/v1/workspaces/:workspaceId/file", requireServiceAuthorization, async (request, response, next) => {
  try {
    const input = fileWriteSchema.parse(request.body);
    const destination = getSafeProjectPath(request.params.workspaceId, input.path);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, input.content, "utf8");
    response.json({ saved: true, path: input.path });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/workspaces/:workspaceId/git/status", requireServiceAuthorization, async (request, response, next) => {
  try {
    const { stdout } = await git(["status", "--short", "--branch"], getWorkspacePath(request.params.workspaceId), getGitHubToken(request));
    response.json({ status: stdout });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/workspaces/:workspaceId/git/commit", requireServiceAuthorization, async (request, response, next) => {
  try {
    const { message } = commitSchema.parse(request.body);
    const workspacePath = getWorkspacePath(request.params.workspaceId);
    await git(["add", "--all"], workspacePath, getGitHubToken(request));
    const { stdout } = await git(["commit", "-m", message], workspacePath, getGitHubToken(request));
    response.json({ committed: true, output: stdout });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/workspaces/:workspaceId/git/push", requireServiceAuthorization, async (request, response, next) => {
  try {
    const { stdout } = await git(["push", "origin", "HEAD"], getWorkspacePath(request.params.workspaceId), getGitHubToken(request));
    response.json({ pushed: true, output: stdout });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/workspaces/:workspaceId/runtime/start", requireServiceAuthorization, async (request, response, next) => {
  try {
    const workspacePath = getWorkspacePath(request.params.workspaceId);
    await stopRuntime(request.params.workspaceId);
    const runtime = { process: null, port: null, output: "Starting npm run dev …\n", startedAt: new Date().toISOString() };
    const child = spawn("npm", ["run", "dev", "--", "--host", "0.0.0.0"], { cwd: workspacePath, env: { ...process.env, BROWSER: "none" }, shell: false });
    runtime.process = child;
    runtimes.set(request.params.workspaceId, runtime);
    child.stdout.on("data", (chunk) => attachRuntimeOutput(runtime, chunk.toString()));
    child.stderr.on("data", (chunk) => attachRuntimeOutput(runtime, chunk.toString()));
    child.on("exit", (code) => {
      runtime.output = `${runtime.output}\nProcess exited with code ${code ?? "unknown"}.`;
      runtime.process = null;
    });
    response.status(202).json({ state: "starting" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/workspaces/:workspaceId/runtime", requireServiceAuthorization, (request, response) => {
  const runtime = runtimes.get(request.params.workspaceId);
  if (!runtime) return response.json({ state: "stopped", output: "No active development process." });
  const previewUrl = runtime.port && publicBaseUrl ? `${publicBaseUrl}/preview/${request.params.workspaceId}/` : undefined;
  return response.json({ state: runtime.process ? "running" : "stopped", output: runtime.output, previewUrl, startedAt: runtime.startedAt });
});

app.post("/api/v1/workspaces/:workspaceId/runtime/stop", requireServiceAuthorization, async (request, response) => {
  await stopRuntime(request.params.workspaceId);
  response.json({ stopped: true });
});

app.post("/api/v1/agent/proposals", requireServiceAuthorization, async (request, response, next) => {
  try {
    const input = agentSchema.parse(request.body);
    const workspacePath = getWorkspacePath(input.workspaceId);
    const fileNames = await listFiles(workspacePath);
    const relevantFiles = fileNames.filter((file) => file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".js") || file.endsWith(".jsx") || file.endsWith(".css")).slice(0, 18);
    const snapshot = await Promise.all(relevantFiles.map(async (file) => ({ file, content: await fs.readFile(getSafeProjectPath(input.workspaceId, file), "utf8") })));
    const proposal = await invokeProvider(request, buildAgentMessages(snapshot, input));
    response.json({ proposal });
  } catch (error) {
    next(error);
  }
});

app.use("/preview/:workspaceId", requireServiceAuthorization, (request, response, next) => {
  const runtime = runtimes.get(request.params.workspaceId);
  if (!runtime?.port) return response.status(503).json({ error: "Die Vorschau wird noch gestartet." });
  request.url = request.url.replace(/^\/preview\/[^/]+/, "") || "/";
  return proxy.web(request, response, { target: `http://127.0.0.1:${runtime.port}` }, next);
});

app.use((error, _request, response, _next) => {
  const message = error instanceof Error ? error.message : "Unbekannter Serverfehler.";
  response.status(error instanceof z.ZodError ? 400 : 500).json({ error: message });
});

const server = http.createServer(app);
server.on("upgrade", (request, socket, head) => {
  const match = request.url?.match(/^\/preview\/([a-z0-9-]+)\//);
  if (!match || !isServiceAuthorized(request)) return socket.destroy();
  const runtime = runtimes.get(match[1]);
  if (!runtime?.port) return socket.destroy();
  request.url = request.url.replace(/^\/preview\/[^/]+/, "") || "/";
  proxy.ws(request, socket, head, { target: `ws://127.0.0.1:${runtime.port}` });
});
server.listen(port, () => console.log(`Custom AI Studio Workspace Service listening on ${port}`));
