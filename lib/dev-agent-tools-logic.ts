/**
 * Sprint 88 — Autonomer Entwicklungs-Chat: Werkzeugdefinitionen fuer den
 * Chat-Agenten. Reine, deterministische Logik (keine Netzwerkaufrufe) fuer
 * das Muster "Logic-Modul in lib/ + Tests in tests/" — Tool-Schema,
 * Request-Bau fuer den Workspace-Service und Ergebnis-Formatierung fuer
 * das Modell.
 *
 * Ziel (Owner-Feedback 14.09.2026): der In-App-Chat soll wie ein echter
 * Superagent selbststaendig Repository-Dateien lesen/schreiben und Git-
 * Operationen ausfuehren koennen, statt den Nutzer zum manuellen Einfuegen
 * von Code aufzufordern.
 */

export const AGENT_TOOL_NAMES = [
  "list_repo_files",
  "read_repo_file",
  "write_repo_file",
  "git_status",
  "commit_changes",
  "push_changes",
  "open_pull_request",
  "list_branches",
  "checkout_branch",
  "list_github_issues",
  "create_github_issue",
  "close_github_issue",
  "save_learning",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export function isAgentToolName(value: string): value is AgentToolName {
  return (AGENT_TOOL_NAMES as readonly string[]).includes(value);
}

/** OpenAI-kompatibles Funktions-Tool-Schema (server/_core/llm.ts Tool-Typ). */
export type AgentToolDefinition = {
  type: "function";
  function: {
    name: AgentToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_repo_files",
      description: "Listet alle Dateien im verbundenen Repository-Workspace auf. Nutze dies zuerst, um dir einen Ueberblick ueber die Projektstruktur zu verschaffen.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "read_repo_file",
      description: "Liest den vollstaendigen Inhalt einer Datei aus dem verbundenen Repository-Workspace anhand ihres relativen Pfads.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Relativer Dateipfad, z. B. 'server/db.ts'." } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_repo_file",
      description: "Schreibt oder erstellt eine Datei im verbundenen Repository-Workspace mit dem angegebenen vollstaendigen Inhalt. Ueberschreibt bestehenden Inhalt komplett.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relativer Dateipfad." },
          content: { type: "string", description: "Vollstaendiger neuer Dateiinhalt." },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_status",
      description: "Zeigt den aktuellen Git-Status (geaenderte Dateien, Branch, Ahead/Behind) des verbundenen Workspaces.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "commit_changes",
      description: "Erstellt einen lokalen Git-Commit ueber alle aktuellen Aenderungen im Workspace mit der angegebenen Commit-Message.",
      parameters: {
        type: "object",
        properties: { message: { type: "string", description: "Commit-Message (max. 240 Zeichen)." } },
        required: ["message"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "push_changes",
      description: "Ueberträgt den aktuellen lokalen Branch inklusive aller Commits zum Remote-Repository (GitHub).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "open_pull_request",
      description: "Erstellt einen Pull Request vom aktuellen Branch gegen den angegebenen Ziel-Branch.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Titel des Pull Requests (mind. 3 Zeichen)." },
          body: { type: "string", description: "Beschreibung des Pull Requests." },
          baseBranch: { type: "string", description: "Ziel-Branch, z. B. 'main'." },
        },
        required: ["title", "baseBranch"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_branches",
      description: "Listet alle Remote-Branches des verbundenen GitHub-Repositorys inklusive des aktuell ausgecheckten Branchs.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "checkout_branch",
      description: "Wechselt im Workspace auf einen Branch. Existiert der Remote-Branch, wird er ausgecheckt; existiert er nicht, wird ein neuer lokaler Feature-Branch vom aktuellen Stand angelegt (branchOrigin im Ergebnis: 'remote' oder 'local').",
      parameters: {
        type: "object",
        properties: { branch: { type: "string", description: "Branch-Name, z. B. 'feature/chat-fix'." } },
        required: ["branch"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_github_issues",
      description: "Listet GitHub-Issues des verbundenen Repositorys mit Nummer, Titel, Zustand, Labels und URL. Nuetzlich, um offene Aufgaben und Bugs autonom zu priorisieren.",
      parameters: {
        type: "object",
        properties: {
          state: { type: "string", description: "'open' (Standard), 'closed' oder 'all'." },
          limit: { type: "number", description: "Maximale Anzahl Issues (1-30, Standard 15)." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_github_issue",
      description: "Erstellt ein neues GitHub-Issue im verbundenen Repository. Nutze dies, um erkannte Bugs, fehlende Features oder Entwicklungsschritte (z. B. fehlende Integrationen) nachvollziehbar zu dokumentieren.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Kurzer, praegnanter Issue-Titel (3-280 Zeichen)." },
          body: { type: "string", description: "Beschreibung: Problem, Kontext, Akzeptanzkriterien." },
          labels: { type: "array", items: { type: "string" }, description: "Bis zu 6 Labels, z. B. ['bug'] oder ['enhancement', 'autonomy']." },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "close_github_issue",
      description: "Schliesst ein GitHub-Issue per Nummer mit optionalem Abschlusskommentar. Schliesse nur Issues, deren Arbeit tatsaechlich abgeschlossen und verifiziert ist.",
      parameters: {
        type: "object",
        properties: {
          number: { type: "number", description: "Issue-Nummer, z. B. 42." },
          comment: { type: "string", description: "Optionales Abschlusskommentar mit Begruendung." },
        },
        required: ["number"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_learning",
      description: "Speichert eine Erkenntnis ins Langzeit-Gedächtnis (Build-Optimierungen, Fehlerbehebungen, Konventionen, Nutzer-Präferenzen), damit spaetere Turns darauf zurueckgreifen koennen. Nutze dies nach abgeschlossenen Fehlerbehebungen, vereinbarten Konventionen und wichtigen Nutzerpraferenzen.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Kurzer Titel der Erkenntnis (max. 160 Zeichen)." },
          detail: { type: "string", description: "Praegnante Beschreibung: was wurde gemacht und warum?" },
          kind: {
            type: "string",
            description: "Art des Learnings: 'build-optimierung', 'fehlerbehebung', 'interaktion' oder 'entscheidung'.",
          },
        },
        required: ["title", "detail"],
        additionalProperties: false,
      },
    },
  },
];

export const MAX_AGENT_TOOL_ITERATIONS = 6;
export const MAX_FILE_LIST_ENTRIES = 250;
export const MAX_FILE_CONTENT_CHARS = 9_000;
export const MAX_TOOL_RESULT_CHARS = 4_000;

/** Sicheres JSON.parse fuer LLM-Tool-Argumente — liefert {} statt zu werfen. */
export function parseToolArguments(raw: string | undefined | null): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function requireStringArg(args: Record<string, unknown>, key: string, maxLength: number): string | { error: string } {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    return { error: `Das Argument '${key}' fehlt oder ist leer.` };
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return { error: `Das Argument '${key}' ist zu lang (max. ${maxLength} Zeichen).` };
  }
  return trimmed;
}

export type WorkspaceToolRequest = {
  method: "GET" | "POST" | "PUT";
  path: string;
  body?: Record<string, unknown>;
};

export type WorkspaceToolRequestResult = { ok: true; request: WorkspaceToolRequest } | { ok: false; error: string };

/**
 * Baut die Workspace-Service-Anfrage fuer einen Tool-Aufruf deterministisch
 * aus Tool-Name + geparsten Argumenten. Validiert Pflichtfelder, bevor ein
 * Netzwerkaufruf versucht wird.
 */
export function buildWorkspaceToolRequest(
  tool: AgentToolName,
  workspaceId: string,
  args: Record<string, unknown>,
): WorkspaceToolRequestResult {
  const base = `/api/render/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;

  switch (tool) {
    case "list_repo_files":
      return { ok: true, request: { method: "GET", path: `${base}/files` } };

    case "read_repo_file": {
      const path = requireStringArg(args, "path", 500);
      if (typeof path !== "string") return { ok: false, error: path.error };
      return { ok: true, request: { method: "GET", path: `${base}/file?path=${encodeURIComponent(path)}` } };
    }

    case "write_repo_file": {
      const path = requireStringArg(args, "path", 500);
      if (typeof path !== "string") return { ok: false, error: path.error };
      const content = args.content;
      if (typeof content !== "string") return { ok: false, error: "Das Argument 'content' fehlt oder ist kein Text." };
      if (content.length > 1_000_000) return { ok: false, error: "Der Dateiinhalt ist zu gross (max. 1.000.000 Zeichen)." };
      return { ok: true, request: { method: "PUT", path: `${base}/file`, body: { path, content } } };
    }

    case "git_status":
      return { ok: true, request: { method: "GET", path: `${base}/git/status` } };

    case "commit_changes": {
      const message = requireStringArg(args, "message", 240);
      if (typeof message !== "string") return { ok: false, error: message.error };
      return { ok: true, request: { method: "POST", path: `${base}/git/commit`, body: { message } } };
    }

    case "push_changes":
      return { ok: true, request: { method: "POST", path: `${base}/git/push` } };

    case "open_pull_request": {
      const title = requireStringArg(args, "title", 140);
      if (typeof title !== "string") return { ok: false, error: title.error };
      if (title.length < 3) return { ok: false, error: "Das Argument 'title' muss mindestens 3 Zeichen lang sein." };
      const baseBranch = requireStringArg(args, "baseBranch", 120);
      if (typeof baseBranch !== "string") return { ok: false, error: baseBranch.error };
      const body = typeof args.body === "string" ? args.body.slice(0, 10_000) : "";
      return { ok: true, request: { method: "POST", path: `${base}/git/pull-request`, body: { title, baseBranch, body } } };
    }

    case "list_branches":
      return { ok: true, request: { method: "GET", path: `${base}/git/branches` } };

    case "checkout_branch": {
      const branch = requireStringArg(args, "branch", 120);
      if (typeof branch !== "string") return { ok: false, error: branch.error };
      return { ok: true, request: { method: "POST", path: `${base}/git/checkout`, body: { branch } } };
    }

    case "list_github_issues": {
      const stateRaw = typeof args.state === "string" ? args.state.trim().toLowerCase() : "open";
      const state = ["open", "closed", "all"].includes(stateRaw) ? stateRaw : "open";
      const limit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.min(Math.max(Math.trunc(args.limit), 1), 30) : 15;
      return { ok: true, request: { method: "GET", path: `${base}/github/issues?state=${state}&limit=${limit}` } };
    }

    case "create_github_issue": {
      const title = requireStringArg(args, "title", 280);
      if (typeof title !== "string") return { ok: false, error: title.error };
      if (title.length < 3) return { ok: false, error: "Das Argument 'title' muss mindestens 3 Zeichen lang sein." };
      const body = typeof args.body === "string" ? args.body.slice(0, 20_000) : "";
      const labels = Array.isArray(args.labels)
        ? args.labels.filter((label): label is string => typeof label === "string" && label.trim().length > 0).map((label) => label.trim().slice(0, 60)).slice(0, 6)
        : [];
      return { ok: true, request: { method: "POST", path: `${base}/github/issues`, body: { title, body, labels } } };
    }

    case "close_github_issue": {
      const issueNumber = args.number;
      if (typeof issueNumber !== "number" || !Number.isInteger(issueNumber) || issueNumber < 1) {
        return { ok: false, error: "Das Argument 'number' fehlt oder ist keine gueltige Issue-Nummer." };
      }
      const comment = typeof args.comment === "string" ? args.comment.slice(0, 10_000) : "";
      return { ok: true, request: { method: "POST", path: `${base}/github/issues/close`, body: { number: issueNumber, comment } } };
    }

    default:
      return { ok: false, error: `Unbekanntes Werkzeug: ${tool}` };
  }
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n… [gekuerzt, ${text.length - maxChars} weitere Zeichen abgeschnitten]`;
}

/**
 * Formatiert die Rohantwort des Workspace-Service in eine kompakte, fuer das
 * Modell verdauliche Textform (Tool-Ergebnis-Nachricht). Deterministisch:
 * gleiche Eingabe liefert immer dieselbe Ausgabe.
 */
export function formatToolResultForModel(tool: AgentToolName, payload: unknown): string {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};

  switch (tool) {
    case "list_repo_files": {
      const files = Array.isArray(record.files) ? record.files as unknown[] : [];
      const paths = files
        .map((entry) => (typeof entry === "string" ? entry : (entry as { path?: string })?.path))
        .filter((value): value is string => typeof value === "string");
      const shown = paths.slice(0, MAX_FILE_LIST_ENTRIES);
      const suffix = paths.length > shown.length ? `\n… und ${paths.length - shown.length} weitere Dateien.` : "";
      return `${shown.length} von ${paths.length} Dateien:\n${shown.join("\n")}${suffix}`;
    }

    case "read_repo_file": {
      const content = typeof record.content === "string" ? record.content : "";
      return truncate(content, MAX_FILE_CONTENT_CHARS);
    }

    case "write_repo_file":
      return record.saved ? `Datei '${String(record.path ?? "")}' erfolgreich gespeichert.` : "Datei konnte nicht gespeichert werden.";

    case "git_status": {
      const status = typeof record.status === "string" ? record.status.trim() : "";
      const ahead = record.localAhead ? " (lokale Commits noch nicht gepusht)" : "";
      const behind = record.remoteAhead ? " (Remote hat neuere Commits)" : "";
      return `${status || "Keine Aenderungen."}${ahead}${behind}`;
    }

    case "commit_changes":
      return record.committed ? `Commit erstellt: ${String(record.hash ?? "")}` : "Commit fehlgeschlagen.";

    case "push_changes":
      return record.pushed ? `Branch '${String(record.branch ?? "")}' erfolgreich gepusht.` : "Push fehlgeschlagen.";

    case "open_pull_request":
      return record.number
        ? `Pull Request #${String(record.number)} erstellt: ${String(record.html_url ?? record.url ?? "")}`
        : "Pull Request konnte nicht erstellt werden.";

    case "list_branches": {
      const branches = Array.isArray(record.branches) ? record.branches.filter((b): b is string => typeof b === "string") : [];
      const current = typeof record.currentBranch === "string" ? record.currentBranch : "";
      return `Aktuell: ${current || "unbekannt"}\nRemote-Branches (${branches.length}):\n${branches.join("\n") || "keine"}`;
    }

    case "checkout_branch": {
      const origin = record.branchOrigin === "local" ? " (neuer lokaler Branch — Remote hatte ihn noch nicht)" : "";
      return `Auf Branch '${String(record.branch ?? "")}' gewechselt${origin}.`;
    }

    case "list_github_issues": {
      const issues = Array.isArray(record.issues) ? record.issues as Array<Record<string, unknown>> : [];
      if (!issues.length) return "Keine Issues gefunden.";
      const lines = issues.map((issue) => {
        const labels = Array.isArray(issue.labels) ? (issue.labels as unknown[]).filter((l): l is string => typeof l === "string").join(", ") : "";
        const labelSuffix = labels ? ` [${labels}]` : "";
        return `#${String(issue.number ?? "")} (${String(issue.state ?? "")})${labelSuffix} ${String(issue.title ?? "")} — ${String(issue.url ?? "")}`;
      });
      return truncate(lines.join("\n"), MAX_TOOL_RESULT_CHARS);
    }

    case "create_github_issue":
      return record.number
        ? `Issue #${String(record.number)} erstellt: ${String(record.url ?? "")}`
        : "Issue konnte nicht erstellt werden.";

    case "close_github_issue":
      return record.closed
        ? `Issue #${String(record.number ?? "")} geschlossen.`
        : `Issue #${String(record.number ?? "")} konnte nicht geschlossen werden (Zustand: ${String(record.state ?? "unbekannt")}).`;

    default:
      return truncate(JSON.stringify(record), MAX_TOOL_RESULT_CHARS);
  }
}

/**
 * System-Prompt fuer den autonomen Werkzeug-Modus: nur aktiv, wenn ein
 * Workspace verbunden ist. Weist das Modell explizit an, Werkzeuge statt
 * Rueckfragen zu nutzen.
 */
export function buildAgentSystemPrompt(branch: string, currentProvider?: string): string {
  const providerNotice = currentProvider
    ? `\n\nSystem-Hinweis: Diese Konversation laeuft gerade ueber den Provider '${currentProvider}'${currentProvider === "managed" ? " (das ist der On-Server-LLM)" : ""} — er antwortet dir also gerade tatsaechlich und funktioniert damit nachweislich. Wenn danach gefragt wird, ob "der On-Server-Provider" oder "die KI" funktioniert, ist die Tatsache, dass du gerade antwortest, bereits ein Beleg; nutze zusaetzlich get_provider_status fuer den vollstaendigen Status aller Provider (Cloud, lokal, Key-Pool), bevor du eine endgueltige Aussage triffst — rate niemals und behaupte nie Unwissenheit, wenn ein Werkzeug die Antwort liefern kann.`
    : "";
  return `Du bist CyberSarah, eine autonome Entwicklungsassistentin im Control Center mit direktem Werkzeugzugriff auf das verbundene GitHub-Repository (aktueller Branch: ${branch}).${providerNotice}

Du hast Werkzeuge, um selbststaendig zu arbeiten: Repository/Git (list_repo_files, read_repo_file, write_repo_file, git_status, commit_changes, push_changes, open_pull_request, list_branches, checkout_branch), GitHub-Issue-Management (list_github_issues, create_github_issue, close_github_issue) sowie Live-Geschaeftsdaten (get_revenue_metrics: Stripe-Einnahmen und Abonnements; get_crypto_prices: BTC/ETH/SOL-Echtzeitkurse mit Kraken-Fallback; get_analytics_overview: GA4-Kennzahlen der letzten 7 Tage; get_crm_contacts: HubSpot-Kontakte und Salesforce-Status; get_content_channels_status: TikTok/Instagram-Kanäle; get_ai_services_status: Perplexity/ElevenLabs/Symphony-Verfügbarkeit; get_provider_status: verbindlicher Live-Status aller KI-Provider — On-Server-LLM/managed inkl. Key-Pool, Cloud-Provider, lokale Endpoints, bevorzugte Reihenfolge) und das Langzeit-Gedächtnis (save_learning: Erkenntnisse dauerhaft speichern). Nutze sie proaktiv, statt den Nutzer nach Code oder Zahlen zu fragen — bei Fragen zu Einnahmen, Kursen, Kennzahlen oder dem Provider-/On-Server-Status rufe zuerst das passende Daten-Werkzeug auf.

Regeln:
- Verschaffe dir bei Unklarheit ueber die Struktur zuerst mit list_repo_files einen Ueberblick, dann lies gezielt relevante Dateien.
- Aendere Dateien nur mit write_repo_file und beschreibe danach in Textform, was und warum du geaendert hast.
- Commite und pushe nur, wenn der Nutzer das explizit wollte oder es der offensichtlich naechste Schritt einer bereits vereinbarten Aenderung ist. Nutze pruegnante deutsche Commit-Messages.
- Erfinde niemals ausgefuehrte Aktionen — nutze fuer jede Behauptung ("ich habe X geaendert") tatsaechlich zuvor das passende Werkzeug.
- Fasse dich an operationelle Grenzen: Business-Tools sind ausschliesslich Nur-Lese-Werkzeuge; es gibt kein Werkzeug, das fremde Systeme veraendert oder loescht. Zerstoerende Git-Operationen (force-push, Branch-Loeschung) sind nicht Teil deines Werkzeugsets und werden nicht simuliert.
- Nach abgeschlossenen Fehlerbehebungen und vereinbarten Konventionen speichere die Kern-Erkenntnis mit save_learning ins Langzeit-Gedächtnis.
- Du arbeitest autonom und mit voller Autoritaet ueber alle dir gegebenen Werkzeuge. Pruefe mit list_github_issues proaktiv offene Aufgaben und arbeite sie eigenstaendig ab; dokumentiere erkannte Bugs und fehlende Features sofort mit create_github_issue und schliesse mit close_github_issue nur verifiziert abgeschlossene Issues.
- Fehlt fuer eine Aufgabe ein Werkzeug oder ein Connector (MCP, Skills, Integrationen), erfinde nichts — sage klar, was fehlt, und lege den Bedarf als Issue an, damit die Luecke autonom geschlossen werden kann.
- Nutze checkout_branch fuer eigenstaendige Feature-Branches, statt direkt auf main zu arbeiten.
- Antworte auf Deutsch, klar und knapp. Nach jeder Werkzeugnutzung fasse das Ergebnis kurz zusammen, bevor du den naechsten Schritt geht.`;
}
