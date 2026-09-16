/**
 * Client fuer das CyberSarah FastAPI-Backend (render.yaml: cybersarah-backend).
 *
 * Drei Transportwege, ein Protokoll:
 *  - REST  : Task-Ledger, Agenten-State, Logs, Emergency Stop
 *  - WS    : /ws/tasks — Live-Events (task.created, log.appended, agent.state)
 *  - SSE   : POST /api/chat/stream — wortgenaue Chat-Deltas
 *
 * Bewusst self-contained: keine tRPC-/Expo-Abhaengigkeiten, damit das Modul
 * in Node/Vitest vollstaendig testbar bleibt. Die UI-Konsumenten fallen
 * elegant auf ihre lokalen tRPC-Quellen zurueck, wenn das Backend offline ist.
 */

export type BackendTaskStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface BackendTask {
  id: number;
  title: string;
  description: string;
  status: BackendTaskStatus;
  priority: number;
  payload: Record<string, unknown> | null;
  result: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface BackendAgentLog {
  id: number;
  task_id: number | null;
  level: "debug" | "info" | "warn" | "error" | "success";
  message: string;
  data: Record<string, unknown> | null;
  created_at: string;
}

export interface BackendAgentStatus {
  mode: string;
  stopped: boolean;
  ws_clients: number;
  status: {
    agent_id: string;
    cached: boolean;
    cache_keys: string[];
  };
}

export interface BackendEvent {
  type: string;
  data: unknown;
  ts: number;
}

/** Basis-URL: EXPO_PUBLIC_* ist auf Expo-Seite der Standard fuer Public-ENV. */
export function backendBaseUrl(): string {
  const fromEnv =
    globalThis?.process?.env?.EXPO_PUBLIC_CYBERSARAH_BACKEND_URL ??
    globalThis?.process?.env?.CYBERSARAH_BACKEND_URL;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/\/+$/, "");
  return "https://cybersarah-backend.onrender.com";
}

/** Prueft, ob das Backend erreichbar ist (Timeout 3 s, kein Throw). */
export async function backendReachable(timeoutMs = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${backendBaseUrl()}/healthz`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendBaseUrl()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`Backend ${response.status} bei ${path}`);
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

export function listTasks(status?: BackendTaskStatus): Promise<BackendTask[]> {
  const query = status ? `?status=${status}` : "";
  return requestJson<BackendTask[]>(`/api/tasks${query}`);
}

export function createTask(input: {
  title: string;
  description?: string;
  priority?: number;
}): Promise<BackendTask> {
  return requestJson<BackendTask>("/api/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function listLogs(limit = 100): Promise<BackendAgentLog[]> {
  return requestJson<BackendAgentLog[]>(`/api/logs?limit=${limit}`);
}

export function getAgentStatus(): Promise<BackendAgentStatus> {
  return requestJson<BackendAgentStatus>("/api/agent/status");
}

export function triggerEmergencyStop(): Promise<{ ok: boolean; stopped: boolean }> {
  return requestJson("/api/agent/stop", { method: "POST" });
}

export function releaseEmergencyStop(): Promise<{ ok: boolean; mode: string }> {
  return requestJson("/api/agent/start", { method: "POST" });
}

// ---------------------------------------------------------------------------
// WebSocket: Live-Events
// ---------------------------------------------------------------------------

export interface TasksStreamHandle {
  close: () => void;
}

export interface BackendSocketLike {
  send: (data: string) => void;
  close: () => void;
  onmessage: (raw: unknown) => void;
  onclose: () => void;
}

/**
 * Verbindet /ws/tasks und reicht jede gueltige Event-Zeile an `onEvent`.
 * Reconnect mit Exponential-Backoff (1 s -> 30 s Deckel) — Netzwerkwechsel
 * (WLAN -> Mobilfunk) werden so ohne manuelles Re-Attach ueberstanden.
 */
export function connectTasksStream(
  onEvent: (event: BackendEvent) => void,
  socketFactory: (url: string) => BackendSocketLike = (url) =>
    new WebSocket(url) as unknown as BackendSocketLike,
  backoffMs: () => number = (() => {
    let attempt = 0;
    return () => {
      const delay = Math.min(1000 * 2 ** attempt, 30_000);
      attempt = Math.min(attempt + 1, 5);
      return delay;
    };
  })(),
): TasksStreamHandle {
  let closedByClient = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let currentSocket: BackendSocketLike | null = null;

  const open = (): void => {
    if (closedByClient) return;
    const socket = socketFactory(`${backendBaseUrl().replace(/^http/, "ws")}/ws/tasks`);
    currentSocket = socket;
    socket.onmessage = (raw: unknown) => {
      const parsed = parseBackendEvent(typeof raw === "string" ? raw : "");
      if (parsed) onEvent(parsed);
    };
    socket.onclose = () => {
      if (closedByClient) return;
      timer = setTimeout(open, backoffMs());
    };
  };

  open();
  return {
    close: () => {
      closedByClient = true;
      if (timer) clearTimeout(timer);
      currentSocket?.close();
    },
  };
}

/** Parst eine WS-/SSE-Zeile in ein Backend-Event (oder null bei Muell). */
export function parseBackendEvent(raw: string): BackendEvent | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BackendEvent>;
    if (typeof parsed.type !== "string" || parsed.data === undefined) return null;
    return { type: parsed.type, data: parsed.data, ts: typeof parsed.ts === "number" ? parsed.ts : 0 };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SSE: Chat-Streaming (wortgenau)
// ---------------------------------------------------------------------------

export interface ChatDeltaHandlers {
  onDelta: (delta: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

/** Parst einen SSE-Textblock in Delta-Frames (reine Logik, testbar). */
export function parseSseBlock(block: string): { deltas: string[]; done: boolean; error: string | null } {
  const deltas: string[] = [];
  let done = false;
  let error: string | null = null;
  for (const line of block.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    try {
      const parsed = JSON.parse(payload) as { delta?: string; done?: boolean; error?: string };
      if (typeof parsed.delta === "string") deltas.push(parsed.delta);
      if (parsed.done === true) done = true;
      if (typeof parsed.error === "string") error = parsed.error;
    } catch {
      // Ungueltiger Frame wird uebersprungen — Stream bleibt nutzbar.
    }
  }
  return { deltas, done, error };
}

/**
 * Streamt eine Chat-Antwort via SSE und ruft onDelta pro Token-Chunk.
 * `signal` erlaubt Abbruch; Fehler landen in onError statt einem Crash.
 */
export async function streamChat(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  handlers: ChatDeltaHandlers,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const response = await fetch(`${backendBaseUrl()}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ messages, max_history: 8 }),
      signal,
    });
    if (!response.ok || !response.body) {
      handlers.onError?.(`Backend ${response.status}`);
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const parsed = parseSseBlock(frame);
        for (const delta of parsed.deltas) handlers.onDelta(delta);
        if (parsed.error) handlers.onError?.(parsed.error);
        if (parsed.done) {
          finished = true;
          handlers.onDone?.();
        }
      }
    }
    if (!finished) handlers.onDone?.();
  } catch (error) {
    if ((error as { name?: string })?.name === "AbortError") return;
    handlers.onError?.(error instanceof Error ? error.message : "Stream-Fehler");
  }
}
