/**
 * GitHub-Integration (rein, testbar): OAuth-Flow, PAT-Maskierung, PR-Erstellung,
 * Branch-Management und Webhook-Verarbeitung. Nebeneffekte (API-Calls) macht
 * ausschliesslich die Transportschicht — dieses Modul liefert validierte,
 * deterministische_payloads und Reducer.
 */

export const GITHUB_OAUTH_SCOPES = ["repo", "read:org"] as const;

export type GithubOAuthConfig = {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
};

/** Autorisierungs-URL des GitHub-OAuth-Device/Web-Flows inklusive State-Schutz. */
export function buildGithubOAuthUrl(config: GithubOAuthConfig): string {
  if (!/^[A-Za-z0-9]{8,32}$/.test(config.clientId)) {
    throw new Error("Ungültige GitHub-Client-ID");
  }
  if (!/^https:\/\//i.test(config.redirectUri)) {
    throw new Error("Redirect-URI muss HTTPS verwenden");
  }
  if (config.state.length < 8) {
    throw new Error("OAuth-State muss mindestens 8 Zeichen haben (CSRF-Schutz)");
  }
  const scopes = (config.scopes ?? GITHUB_OAUTH_SCOPES).join(" ");
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: scopes,
    state: config.state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/** Callback validieren (State muss zeichenweise uebereinstimmen). */
export function validateOAuthCallback(
  query: { code?: string; state?: string; error?: string },
  expectedState: string,
): { ok: true; code: string } | { ok: false; reason: string } {
  if (query.error) return { ok: false, reason: `GitHub-Fehler: ${query.error}` };
  if (!query.code) return { ok: false, reason: "OAuth-Code fehlt" };
  if (query.state !== expectedState) return { ok: false, reason: "OAuth-State stimmt nicht überein (CSRF-Verdacht)" };
  return { ok: true, code: query.code };
}

/** Zeigt nur Praefix und die letzten 4 Zeichen — der Voll-Key bleibt geheim. */
export function maskGithubToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length < 12) return "…(zu kurz)";
  return `${trimmed.slice(0, 7)}…${trimmed.slice(-4)}`;
}

export function isPlausibleGithubToken(token: string): boolean {
  return /^(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})$/.test(token.trim());
}

/** Branch-Namen aus einem Titel ableiten: kebab-case, max. 48 Zeichen, stabiles Praefix. */
export function suggestBranchName(base: "main" | "develop", title: string, prefix: "feature" | "fix" | "sprint" = "feature"): string {
  const slug = title
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const safeBase = base === "develop" ? "develop" : "main";
  return `${prefix}/${safeBase}/${slug || "arbeit"}`;
}

export function validateBranchName(branch: string): { ok: true } | { ok: false; reason: string } {
  const value = branch.trim();
  if (value.length === 0) return { ok: false, reason: "Branch-Name fehlt" };
  if (value.length > 120) return { ok: false, reason: "Branch-Name zu lang" };
  if (/[~^:?*[\\\s]/.test(value)) return { ok: false, reason: "Branch-Name enthält ungültige Zeichen" };
  if (value.startsWith("-") || value.endsWith("/") || value.includes("//")) {
    return { ok: false, reason: "Branch-Name hat ungültige Struktur" };
  }
  return { ok: true };
}

export type PullRequestInput = {
  title: string;
  body?: string;
  head: string;
  base?: string;
  filesChanged?: readonly string[];
};

export type PullRequestPayload = {
  title: string;
  body: string;
  head: string;
  base: string;
};

/** PR-Payload bauen und validieren (Body inkl. Datei-Uebersicht). */
export function buildPullRequestPayload(input: PullRequestInput): PullRequestPayload {
  const title = input.title.trim();
  if (title.length < 3) throw new Error("PR-Titel zu kurz");
  const head = input.head.trim();
  const base = (input.base ?? "main").trim();
  if (!validateBranchName(head).ok || !validateBranchName(base).ok) {
    throw new Error("Ungültiger Branch-Name im PR");
  }
  const fileList = input.filesChanged && input.filesChanged.length > 0 ? `\n\n**Geänderte Dateien (${input.filesChanged.length}):**\n${[...input.filesChanged].sort().map((file) => `- ${file}`).join("\n")}` : "";
  const body = `${(input.body ?? "").trim()}${fileList}`.trim();
  return { title, body, head, base };
}

export type GithubWebhookEvent =
  | { kind: "push"; branch: string; commits: number; sender: string }
  | { kind: "pr-opened"; number: number; title: string; head: string; base: string }
  | { kind: "pr-merged"; number: number; title: string; mergeCommit: string }
  | { kind: "ignored"; type: string };

/** Webhook-Payload normalisieren — unbekannte Typs werden ignoriert, nie geworfen. */
export function processGithubWebhook(type: string, payload: unknown): GithubWebhookEvent {
  const data = (payload ?? {}) as Record<string, unknown>;
  if (type === "push") {
    const ref = typeof data.ref === "string" ? data.ref : "";
    const commits = Array.isArray(data.commits) ? data.commits.length : 0;
    const sender = (data.sender as { login?: string } | undefined)?.login ?? "unbekannt";
    return { kind: "push", branch: ref.replace(/^refs\/heads\//, "") || "unbekannt", commits, sender };
  }
  if (type === "pull_request") {
    const action = typeof data.action === "string" ? data.action : "";
    const pr = (data.pull_request ?? {}) as Record<string, unknown>;
    const number = typeof data.number === "number" ? data.number : 0;
    const title = typeof pr.title === "string" ? pr.title : "Ohne Titel";
    if (action === "opened" || action === "reopened") {
      return {
        kind: "pr-opened",
        number,
        title,
        head: typeof pr.head === "object" && pr.head !== null ? String((pr.head as Record<string, unknown>).ref ?? "") : "",
        base: typeof pr.base === "object" && pr.base !== null ? String((pr.base as Record<string, unknown>).ref ?? "") : "",
      };
    }
    if (action === "closed" && pr.merged === true) {
      return { kind: "pr-merged", number, title, mergeCommit: typeof pr.merge_commit_sha === "string" ? pr.merge_commit_sha : "" };
    }
    return { kind: "ignored", type: `pull_request.${action}` };
  }
  return { kind: "ignored", type };
}
