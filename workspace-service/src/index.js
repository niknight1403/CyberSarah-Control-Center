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
const gitCommitAuthorName = process.env.GIT_COMMIT_AUTHOR_NAME ?? "Custom AI Studio";
const gitCommitAuthorEmail = process.env.GIT_COMMIT_AUTHOR_EMAIL ?? "workspace@custom-ai-studio.local";
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
const branchNameSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,118}$/, "Ungültiger Branch-Name.");
const checkoutSchema = z.object({ branch: branchNameSchema });
const commitLimitSchema = z.coerce.number().int().min(1).max(30).default(10);
const pullRequestSchema = z.object({
  baseBranch: branchNameSchema,
  title: z.string().trim().min(3).max(140),
  body: z.string().trim().max(10_000).default(""),
});
const agentSchema = z.object({
  workspaceId: workspaceIdSchema,
  prompt: z.string().min(1).max(8_000),
  activeFile: z.string().max(500).optional(),
});
const auditEventSchema = z.object({
  eventId: z.string().min(1).max(160),
  action: z.enum(["build", "test", "commit", "push", "pull_request", "ci", "release"]),
  status: z.enum(["started", "passed", "failed", "cancelled"]),
  repository: z.string().max(300).optional(),
  branch: z.string().max(120).optional(),
  commitSha: z.string().max(80).optional(),
  runId: z.string().max(160).optional(),
  message: z.string().max(1_000).optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  occurredAt: z.string().datetime().optional(),
});

const auditLogFile = path.resolve(process.env.EXTERNAL_ACTION_AUDIT_LOG ?? path.join(workspacesDirectory, "external-actions.jsonl"));
const externalActionAuditService = {
  sanitize(event) {
    const metadata = event.metadata ? Object.fromEntries(Object.entries(event.metadata).map(([key, value]) => [key, /(token|secret|password|authorization|cookie|api[-_]?key)/i.test(key) ? "[REDACTED]" : value])) : undefined;
    return { ...event, metadata, occurredAt: event.occurredAt ?? new Date().toISOString() };
  },
  async record(event) {
    const safeEvent = this.sanitize(event);
    try {
      await fs.mkdir(path.dirname(auditLogFile), { recursive: true });
      await fs.appendFile(auditLogFile, `${JSON.stringify(safeEvent)}\\n`, "utf8");
    } catch (error) {
      console.warn(JSON.stringify({ scope: "externalActionAuditService", status: "local-log-failed", message: error instanceof Error ? error.message : "unknown" }));
    }
    const sink = process.env.EXTERNAL_ACTION_AUDIT_URL?.trim();
    if (sink) {
      try {
        await fetch(sink, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(safeEvent), signal: AbortSignal.timeout(3_000) });
      } catch (error) {
        console.warn(JSON.stringify({ scope: "externalActionAuditService", status: "sink-failed", message: error instanceof Error ? error.message : "unknown" }));
      }
    }
    return safeEvent;
  },
};

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

async function createGitHubPullRequest(repositoryUrl, token, input) {
  if (!token) throw new Error("Für einen Pull Request ist ein GitHub-Zugriffstoken erforderlich.");
  const { owner, repository } = assertRepositoryUrl(repositoryUrl);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repository}/pulls`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.message === "string" ? payload.message : "Unbekannter GitHub-Fehler";
    throw new Error(`Pull Request konnte nicht erstellt werden (${response.status}): ${message}`);
  }
  return { number: payload.number, url: payload.html_url, state: payload.state, title: payload.title };
}

async function githubJson(pathname, token) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.message === "string" ? payload.message : "Unbekannter GitHub-Fehler";
    throw new Error(`GitHub-Status konnte nicht geladen werden (${response.status}): ${message}`);
  }
  return payload;
}

function getMergeQuality(pullRequest) {
  if (pullRequest.draft) return { state: "draft", label: "Entwurf" };
  if (pullRequest.merged_at) return { state: "merged", label: "Gemergt" };
  if (pullRequest.mergeable === false) return { state: "blocked", label: "Merge blockiert" };
  if (pullRequest.mergeable === null) return { state: "checking", label: "Merge wird geprüft" };
  if (pullRequest.mergeable_state === "clean") return { state: "ready", label: "Merge bereit" };
  return { state: "attention", label: "Prüfung erforderlich" };
}

function getCiQuality(checks) {
  const failed = checks.filter((check) => ["failure", "timed_out", "cancelled", "action_required", "error"].includes(check.conclusion ?? check.status)).length;
  const pending = checks.filter((check) => !check.conclusion && !["success", "neutral", "skipped"].includes(check.status)).length;
  const passed = checks.filter((check) => check.conclusion === "success" || check.status === "success").length;
  if (!checks.length) return { state: "not_configured", label: "Keine CI-Prüfungen", total: 0, passed: 0, failed: 0, pending: 0 };
  if (failed) return { state: "failing", label: "CI fehlgeschlagen", total: checks.length, passed, failed, pending };
  if (pending) return { state: "running", label: "CI läuft", total: checks.length, passed, failed: 0, pending };
  return { state: "passed", label: "CI bestanden", total: checks.length, passed, failed: 0, pending: 0 };
}

function getReviewQuality(reviews) {
  const latestStateByReviewer = new Map();
  for (const review of reviews) {
    const reviewer = review.user?.login;
    const state = String(review.state ?? "").toUpperCase();
    if (!reviewer || !["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED"].includes(state)) continue;
    latestStateByReviewer.set(reviewer, state);
  }
  const states = [...latestStateByReviewer.values()];
  return {
    reviewerCount: states.length,
    approvedCount: states.filter((state) => state === "APPROVED").length,
    requestedChangesCount: states.filter((state) => state === "CHANGES_REQUESTED").length,
  };
}

async function getRepositoryQuality(repositoryUrl, branch, token) {
  if (!token) {
    return { pullRequest: null, merge: { state: "unavailable", label: "GitHub-Token erforderlich" }, ci: { state: "unavailable", label: "CI nicht verfügbar", total: 0, passed: 0, failed: 0, pending: 0, checks: [] }, reviews: { reviewerCount: 0, approvedCount: 0, requestedChangesCount: 0 } };
  }
  const { owner, repository } = assertRepositoryUrl(repositoryUrl);
  const head = encodeURIComponent(`${owner}:${branch}`);
  const pullRequests = await githubJson(`/repos/${owner}/${repository}/pulls?state=open&head=${head}&per_page=1`, token);
  const pullRequest = Array.isArray(pullRequests) ? pullRequests[0] : undefined;
  if (!pullRequest) {
    return { pullRequest: null, merge: { state: "no_pull_request", label: "Kein offener Pull Request" }, ci: { state: "not_configured", label: "Keine CI-Prüfungen", total: 0, passed: 0, failed: 0, pending: 0, checks: [] }, reviews: { reviewerCount: 0, approvedCount: 0, requestedChangesCount: 0 } };
  }
  const fullPullRequest = await githubJson(`/repos/${owner}/${repository}/pulls/${pullRequest.number}`, token);
  const headSha = fullPullRequest.head?.sha;
  const [checkRunsResult, commitStatusResult, reviewsResult] = await Promise.allSettled([
    githubJson(`/repos/${owner}/${repository}/commits/${headSha}/check-runs?per_page=20`, token),
    githubJson(`/repos/${owner}/${repository}/commits/${headSha}/status?per_page=20`, token),
    githubJson(`/repos/${owner}/${repository}/pulls/${pullRequest.number}/reviews?per_page=100`, token),
  ]);
  const checkRunsPayload = checkRunsResult.status === "fulfilled" ? checkRunsResult.value : {};
  const commitStatusPayload = commitStatusResult.status === "fulfilled" ? commitStatusResult.value : {};
  const checkRuns = Array.isArray(checkRunsPayload.check_runs)
    ? checkRunsPayload.check_runs.map((check) => ({ name: check.name, status: check.status, conclusion: check.conclusion, url: check.details_url ?? check.html_url ?? null }))
    : [];
  const commitStatuses = Array.isArray(commitStatusPayload.statuses)
    ? commitStatusPayload.statuses.map((status) => ({ name: status.context, status: status.state, conclusion: status.state, url: status.target_url ?? null }))
    : [];
  const checks = [...checkRuns, ...commitStatuses].slice(0, 8);
  const ci = checkRunsResult.status === "rejected" && commitStatusResult.status === "rejected"
    ? { state: "unavailable", label: "CI-Zugriff eingeschränkt", total: 0, passed: 0, failed: 0, pending: 0, checks: [] }
    : { ...getCiQuality(checks), checks };
  const reviews = reviewsResult.status === "fulfilled" && Array.isArray(reviewsResult.value) ? getReviewQuality(reviewsResult.value) : { reviewerCount: 0, approvedCount: 0, requestedChangesCount: 0 };
  return {
    pullRequest: { number: fullPullRequest.number, title: fullPullRequest.title, url: fullPullRequest.html_url, headBranch: fullPullRequest.head?.ref, baseBranch: fullPullRequest.base?.ref },
    merge: getMergeQuality(fullPullRequest),
    ci,
    reviews,
  };
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

async function getBranchState(workspacePath, token) {
  const [{ stdout: currentOutput }, { stdout: branchOutput }] = await Promise.all([
    git(["branch", "--show-current"], workspacePath, token),
    git(["ls-remote", "--heads", "origin"], workspacePath, token),
  ]);
  const branches = branchOutput
    .split("\n")
    .map((entry) => entry.split("\t")[1]?.replace(/^refs\/heads\//, "") ?? "")
    .filter(Boolean)
    .filter((entry, index, entries) => entries.indexOf(entry) === index)
    .sort((left, right) => left.localeCompare(right));
  return { currentBranch: currentOutput.trim(), branches };
}

async function getRecentCommits(workspacePath, token, limit) {
  const { stdout } = await git(["log", `-n${limit}`, "--date=iso-strict", "--pretty=format:%H%x1f%h%x1f%an%x1f%aI%x1f%s"], workspacePath, token);
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, author, committedAt, message] = line.split("\x1f");
      return { hash, shortHash, author, committedAt, message };
    });
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
    .map(({ file, content }) => `--- ${file} ---\n${content.slice(0, 4_000)}`)
    .join("\n\n");
  return [
    {
      role: "system",
      content: "You are a senior software engineer working in a user-owned repository. Return strict JSON only: {summary:string,rationale:string,changes:[{path:string,content:string,explanation:string}]}. Do not mutate files yourself. Propose no more than four complete text-file replacements. Each path must exactly match a supplied project file; never create, delete, rename, commit, push, change credentials, or execute commands. Preserve unrelated code. If a safe complete-file change is not possible, return an empty changes array and explain why.",
    },
    {
      role: "user",
      content: `Request: ${input.prompt}\nActive file: ${input.activeFile ?? "not specified"}\n\nProject files:\n${context}`,
    },
  ];
}

function normalizeAgentProposal(proposal, allowedFiles) {
  const changes = Array.isArray(proposal?.changes)
    ? proposal.changes
      .filter((change) => change && typeof change.path === "string" && typeof change.content === "string" && typeof change.explanation === "string")
      .filter((change) => allowedFiles.includes(change.path))
      .slice(0, 4)
      .map((change) => ({ path: change.path, content: change.content.slice(0, 1_000_000), explanation: change.explanation.slice(0, 600) }))
    : [];
  return {
    summary: typeof proposal?.summary === "string" ? proposal.summary.slice(0, 1_500) : "Der Agent hat einen Vorschlag erstellt.",
    rationale: typeof proposal?.rationale === "string" ? proposal.rationale.slice(0, 2_000) : "Überprüfe die vorgeschlagenen Dateien vor der Übernahme.",
    changes,
    affectedFiles: changes.map((change) => change.path),
  };
}

async function invokeProvider(request, messages) {
  const provider = request.header("X-AI-Provider") ?? "managed";
  const suppliedKey = request.header("X-AI-Provider-Key")?.trim();
  const environmentKeyByProvider = {
    managed: process.env.MANAGED_LLM_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    groq: process.env.GROQ_API_KEY,
    together: process.env.TOGETHER_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    huggingface: process.env.HF_TOKEN,
  };
  const boundProviderKey = suppliedKey || environmentKeyByProvider[provider];
  const defaults = {
    managed: { baseUrl: process.env.MANAGED_LLM_BASE_URL, key: boundProviderKey, model: process.env.MANAGED_LLM_MODEL ?? "gpt-4o-mini" },
    openai: { baseUrl: "https://api.openai.com/v1/chat/completions", key: boundProviderKey, model: process.env.OPENAI_MODEL ?? "gpt-4o-mini" },
    gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/models", key: boundProviderKey, model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash" },
    openrouter: { baseUrl: "https://openrouter.ai/api/v1/chat/completions", key: boundProviderKey, model: process.env.OPENROUTER_MODEL ?? "openrouter/free" },
    groq: { baseUrl: "https://api.groq.com/openai/v1/chat/completions", key: boundProviderKey, model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile" },
    together: { baseUrl: "https://api.together.xyz/v1/chat/completions", key: boundProviderKey, model: process.env.TOGETHER_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
    anthropic: { baseUrl: "https://api.anthropic.com/v1/messages", key: boundProviderKey, model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest" },
    ollama: { baseUrl: `${process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1"}/chat/completions`, key: suppliedKey || "local", model: process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b" },
    lmstudio: { baseUrl: `${process.env.LMSTUDIO_BASE_URL ?? "http://127.0.0.1:1234/v1"}/chat/completions`, key: suppliedKey || "local", model: process.env.LMSTUDIO_MODEL ?? "local-model" },
    custom: { baseUrl: process.env.CUSTOM_OPENAI_BASE_URL, key: suppliedKey, model: process.env.CUSTOM_OPENAI_MODEL ?? "local-model" },
    huggingface: { baseUrl: "https://router.huggingface.co/v1/chat/completions", key: boundProviderKey, model: process.env.HF_MODEL ?? "deepseek-ai/DeepSeek-R1:fastest" },
  };
  const configuration = defaults[provider];
  if (!configuration?.baseUrl || !configuration.key) throw new Error("Für das ausgewählte KI-Profil fehlt ein API-Key oder eine On-Server-Konfiguration.");

  const isAnthropic = provider === "anthropic";
  const isGemini = provider === "gemini";
  const endpoint = isGemini ? `${configuration.baseUrl}/${configuration.model}:generateContent` : configuration.baseUrl;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: isGemini
      ? { "content-type": "application/json", "x-goog-api-key": configuration.key }
      : isAnthropic
        ? { "content-type": "application/json", "x-api-key": configuration.key, "anthropic-version": "2023-06-01" }
        : { "content-type": "application/json", authorization: `Bearer ${configuration.key}` },
    body: JSON.stringify(
      isGemini
        ? {
            systemInstruction: { parts: [{ text: messages[0]?.content ?? "" }] },
            contents: messages.slice(1).map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
            generationConfig: { temperature: 0.2, responseMimeType: "application/json", maxOutputTokens: 1_800 },
          }
        : isAnthropic
          ? { model: configuration.model, max_tokens: 1_800, system: messages[0].content, messages: messages.slice(1) }
          : { model: configuration.model, temperature: 0.2, response_format: { type: "json_object" }, messages },
    ),
  });
  if (!response.ok) throw new Error(`KI-Provider antwortet mit ${response.status}.`);
  const payload = await response.json();
  const content = isGemini ? payload.candidates?.[0]?.content?.parts?.[0]?.text : isAnthropic ? payload.content?.[0]?.text : payload.choices?.[0]?.message?.content;
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
    const workspacePath = getWorkspacePath(request.params.workspaceId);
    const token = getGitHubToken(request);
    const { stdout } = await git(["status", "--short", "--branch"], workspacePath, token);
    try {
      await git(["fetch", "origin", "--quiet"], workspacePath, token);
      const { stdout: divergence } = await git(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], workspacePath, token);
      const [localAhead = 0, remoteAhead = 0] = divergence.trim().split(/\s+/).map((value) => Number.parseInt(value, 10));
      response.json({ status: stdout, remoteAhead: Number.isFinite(remoteAhead) && remoteAhead > 0, localAhead: Number.isFinite(localAhead) && localAhead > 0, remoteCheckAvailable: true });
    } catch {
      response.json({ status: stdout, remoteAhead: false, localAhead: false, remoteCheckAvailable: false });
    }
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/workspaces/:workspaceId/git/branches", requireServiceAuthorization, async (request, response, next) => {
  try {
    const state = await getBranchState(getWorkspacePath(request.params.workspaceId), getGitHubToken(request));
    response.json(state);
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/workspaces/:workspaceId/git/checkout", requireServiceAuthorization, async (request, response, next) => {
  try {
    const { branch } = checkoutSchema.parse(request.body);
    const workspacePath = getWorkspacePath(request.params.workspaceId);
    const token = getGitHubToken(request);
    await git(["fetch", "origin", `refs/heads/${branch}:refs/remotes/origin/${branch}`], workspacePath, token);
    await git(["checkout", "-B", branch, `origin/${branch}`], workspacePath, token);
    const files = await listFiles(workspacePath);
    response.json({ branch, files });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/workspaces/:workspaceId/git/commits", requireServiceAuthorization, async (request, response, next) => {
  try {
    const limit = commitLimitSchema.parse(request.query.limit);
    const commits = await getRecentCommits(getWorkspacePath(request.params.workspaceId), getGitHubToken(request), limit);
    response.json({ commits });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/workspaces/:workspaceId/git/commit", requireServiceAuthorization, async (request, response, next) => {
  try {
    const { message } = commitSchema.parse(request.body);
    const workspacePath = getWorkspacePath(request.params.workspaceId);
    await git(["add", "--all"], workspacePath, getGitHubToken(request));
    const { stdout } = await git(["-c", `user.name=${gitCommitAuthorName}`, "-c", `user.email=${gitCommitAuthorEmail}`, "commit", "-m", message], workspacePath, getGitHubToken(request));
    const { stdout: hash } = await git(["rev-parse", "--short", "HEAD"], workspacePath, getGitHubToken(request));
    await externalActionAuditService.record({ eventId: crypto.randomUUID(), action: "commit", status: "passed", branch: (await git(["branch", "--show-current"], workspacePath, getGitHubToken(request))).stdout.trim(), commitSha: hash.trim(), message: "Lokaler Commit erstellt." });
    response.json({ committed: true, hash: hash.trim(), output: stdout });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/workspaces/:workspaceId/git/push", requireServiceAuthorization, async (request, response, next) => {
  try {
    const workspacePath = getWorkspacePath(request.params.workspaceId);
    const { stdout: branchOutput } = await git(["branch", "--show-current"], workspacePath, getGitHubToken(request));
    const branch = branchNameSchema.parse(branchOutput.trim());
    const { stdout } = await git(["push", "origin", `HEAD:refs/heads/${branch}`], workspacePath, getGitHubToken(request));
    const { stdout: commitSha } = await git(["rev-parse", "HEAD"], workspacePath, getGitHubToken(request));
    await externalActionAuditService.record({ eventId: crypto.randomUUID(), action: "push", status: "passed", branch, commitSha: commitSha.trim(), message: "Branch erfolgreich zum Remote übertragen." });
    response.json({ pushed: true, branch, output: stdout });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/workspaces/:workspaceId/git/pull-request", requireServiceAuthorization, async (request, response, next) => {
  try {
    const input = pullRequestSchema.parse(request.body);
    const workspacePath = getWorkspacePath(request.params.workspaceId);
    const { stdout: repositoryUrlOutput } = await git(["remote", "get-url", "origin"], workspacePath, getGitHubToken(request));
    const { stdout: headBranchOutput } = await git(["branch", "--show-current"], workspacePath, getGitHubToken(request));
    const headBranch = branchNameSchema.parse(headBranchOutput.trim());
    if (headBranch === input.baseBranch) throw new Error("Quell- und Zielbranch eines Pull Requests müssen unterschiedlich sein.");
    const pullRequest = await createGitHubPullRequest(repositoryUrlOutput.trim(), getGitHubToken(request), {
      title: input.title,
      body: input.body,
      head: headBranch,
      base: input.baseBranch,
    });
    await externalActionAuditService.record({ eventId: crypto.randomUUID(), action: "pull_request", status: "passed", branch: headBranch, message: `Pull Request #${pullRequest.number} erstellt.` });
    response.status(201).json({ ...pullRequest, headBranch, baseBranch: input.baseBranch });
  } catch (error) {
    next(error);
  }
});

app.post("/api/v1/audit/external-action", requireServiceAuthorization, async (request, response, next) => {
  try {
    const input = auditEventSchema.parse(request.body);
    const event = await externalActionAuditService.record(input);
    response.status(202).json({ accepted: true, eventId: event.eventId });
  } catch (error) {
    next(error);
  }
});

app.get("/api/v1/workspaces/:workspaceId/git/quality", requireServiceAuthorization, async (request, response, next) => {
  try {
    const workspacePath = getWorkspacePath(request.params.workspaceId);
    const { stdout: repositoryUrlOutput } = await git(["remote", "get-url", "origin"], workspacePath, getGitHubToken(request));
    const { stdout: branchOutput } = await git(["branch", "--show-current"], workspacePath, getGitHubToken(request));
    const branch = branchNameSchema.parse(branchOutput.trim());
    const quality = await getRepositoryQuality(repositoryUrlOutput.trim(), branch, getGitHubToken(request));
    response.json({ branch, ...quality });
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
    const sourceFiles = fileNames.filter((file) => file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".js") || file.endsWith(".jsx") || file.endsWith(".css") || file.endsWith(".json"));
    const relevantFiles = [...new Set([input.activeFile, ...sourceFiles].filter((file) => typeof file === "string" && sourceFiles.includes(file)))].slice(0, 8);
    const snapshot = await Promise.all(relevantFiles.map(async (file) => ({ file, content: await fs.readFile(getSafeProjectPath(input.workspaceId, file), "utf8") })));
    const proposal = normalizeAgentProposal(await invokeProvider(request, buildAgentMessages(snapshot, input)), relevantFiles);
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
