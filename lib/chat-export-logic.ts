/**
 * Sprint 58 — Chat-Export: Sitzungen als Markdown oder JSON exportieren.
 *
 * Deterministische, verlustfreie Exportsicherung der persistenten
 * Chat-Historie (Sprint 54/57) — fuer Backup, Handoff und Archivierung.
 * Reine Logik ohne IO; die Router-Anbindung uebergibt nur Daten.
 */

export type ExportFormat = "markdown" | "json";

export interface ExportMessage {
  role: string;
  content: string;
  createdAt?: Date | string;
  provider?: string | null;
}

export interface ExportSession {
  sessionId: string;
  title: string;
  messages: ExportMessage[];
}

export interface ExportRequest {
  sessions: ExportSession[];
  format: ExportFormat;
  exportedAt?: Date | string;
  userLabel?: string;
}

export interface ExportResult {
  filename: string;
  mimeType: string;
  content: string;
}

const ROLE_LABELS: Record<string, string> = {
  user: "Nutzer",
  assistant: "CyberSarah",
  system: "System",
};

function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

function formatTimestamp(value: Date | string | undefined): string {
  if (value === undefined) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

/** Sichere Dateinamen: nur alphanumerische Zeichen, Bindestriche, Unterstriche. */
export function sanitizeFileLabel(label: string): string {
  const cleaned = String(label ?? "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned === "" ? "chat" : cleaned.slice(0, 40);
}

/** Deterministischer Export-Dateiname mit Zeitstempel. */
export function buildExportFilename(
  userLabel: string,
  format: ExportFormat,
  exportedAt: Date | string,
): string {
  const timestamp = formatTimestamp(exportedAt)?.replace(/[:.]/g, "-") ?? "unbekannt";
  const extension = format === "markdown" ? "md" : "json";
  return `chat-export-${sanitizeFileLabel(userLabel)}-${timestamp}.${extension}`;
}

/** Validiert die Anfrage vor dem Export — leere Exports werden abgelehnt. */
export function validateExportRequest(
  request: ExportRequest,
): { valid: true } | { valid: false; reason: string } {
  if (request.sessions.length === 0) {
    return { valid: false, reason: "Keine Sitzungen zum Export uebergeben." };
  }
  const emptySession = request.sessions.find((session) => session.messages.length === 0);
  if (emptySession) {
    return {
      valid: false,
      reason: `Sitzung "${emptySession.sessionId}" enthaelt keine Nachrichten.`,
    };
  }
  return { valid: true };
}

function escapeMarkdownHeading(text: string): string {
  return String(text ?? "").replace(/^#+/, "").trim();
}

/** Baut den Markdown-Export: Titel, Sitzungsabschnitte, Nachrichten mit Rollenlabels. */
export function buildMarkdownExport(request: ExportRequest): string {
  const exportedAt = formatTimestamp(request.exportedAt) ?? new Date().toISOString();
  const lines: string[] = [
    "# CyberSarah Control Center — Chat-Export",
    "",
    `Exportiert: ${exportedAt}`,
  ];
  if (request.userLabel) {
    lines.push(`Nutzer: ${request.userLabel}`);
  }
  lines.push(`Sitzungen: ${request.sessions.length}`, "");

  for (const session of request.sessions) {
    lines.push(`## ${escapeMarkdownHeading(session.title || session.sessionId)}`, "");
    for (const message of session.messages) {
      const timestamp = formatTimestamp(message.createdAt);
      const stamp = timestamp ? ` _(${timestamp})_` : "";
      lines.push(`**${roleLabel(message.role)}**${stamp}:`, "", message.content, "");
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

/** Baut den JSON-Export mit stabiler Feldreihenfolge (parse-stabil). */
export function buildJsonExport(request: ExportRequest): string {
  const payload = {
    export: {
      format: "cybersarah-chat-export",
      version: 1,
      exportedAt: formatTimestamp(request.exportedAt) ?? new Date().toISOString(),
      userLabel: request.userLabel ?? null,
      sessions: request.sessions.map((session) => ({
        sessionId: session.sessionId,
        title: session.title,
        messages: session.messages.map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: formatTimestamp(message.createdAt) || null,
          provider: message.provider ?? null,
        })),
      })),
    },
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** Fasst die Validierung und Formatwahl zusammen und liefert das Exportergebnis. */
export function buildChatExport(request: ExportRequest): ExportResult {
  const validation = validateExportRequest(request);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }
  const exportedAt = request.exportedAt ?? new Date();
  const content =
    request.format === "markdown"
      ? buildMarkdownExport({ ...request, exportedAt })
      : buildJsonExport({ ...request, exportedAt });
  return {
    filename: buildExportFilename(request.userLabel ?? "chat", request.format, exportedAt),
    mimeType: request.format === "markdown" ? "text/markdown" : "application/json",
    content,
  };
}
