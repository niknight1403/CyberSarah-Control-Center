import { describe, expect, it } from "vitest";
import {
  buildChatExport,
  buildExportFilename,
  buildJsonExport,
  buildMarkdownExport,
  sanitizeFileLabel,
  validateExportRequest,
  type ExportSession,
} from "../lib/chat-export-logic";

const sessions: ExportSession[] = [
  {
    sessionId: "default",
    title: "Wie deploye ich auf Render?",
    messages: [
      {
        role: "user",
        content: "Wie deploye ich auf Render?",
        createdAt: "2026-09-10T10:00:00.000Z",
        provider: null,
      },
      {
        role: "assistant",
        content: "Render-Dienst anlegen und ENV setzen.",
        createdAt: "2026-09-10T10:00:05.000Z",
        provider: "managed",
      },
    ],
  },
];

describe("chat-export-logic", () => {
  it("bereinigt Datei-Labels konservativ inkl. Umlauten", () => {
    expect(sanitizeFileLabel("Heinz-Nikola Oeben")).toBe("heinz-nikola-oeben");
    expect(sanitizeFileLabel("ÄÖÜ/ß — Test!!")).toBe("aeoeue-ss-test");
    expect(sanitizeFileLabel("   ")).toBe("chat");
    expect(sanitizeFileLabel("x".repeat(100))).toHaveLength(40);
  });

  it("baut deterministische Dateinamen mit Zeitstempel", () => {
    const name = buildExportFilename("HNO", "markdown", "2026-09-10T10:00:00.000Z");
    expect(name).toBe("chat-export-hno-2026-09-10T10-00-00-000Z.md");
    expect(buildExportFilename("HNO", "json", "2026-09-10T10:00:00.000Z")).toMatch(/\.json$/);
  });

  it("lehnt Exports ohne Sitzungen oder mit leeren Sitzungen ab", () => {
    expect(validateExportRequest({ sessions: [], format: "markdown" }).valid).toBe(false);
    const empty = validateExportRequest({
      sessions: [{ sessionId: "leer", title: "Leer", messages: [] }],
      format: "markdown",
    });
    expect(empty.valid).toBe(false);
    expect((empty as { reason: string }).reason).toContain("leer");
    expect(validateExportRequest({ sessions, format: "markdown" }).valid).toBe(true);
  });

  it("erzeugt Markdown mit Sitzungsabschnitten und Rollenlabels", () => {
    const markdown = buildMarkdownExport({
      sessions,
      format: "markdown",
      exportedAt: "2026-09-10T12:00:00.000Z",
      userLabel: "hno",
    });
    expect(markdown).toContain("# CyberSarah Control Center — Chat-Export");
    expect(markdown).toContain("## Wie deploye ich auf Render?");
    expect(markdown).toContain("**Nutzer** _(2026-09-10T10:00:00.000Z)_:");
    expect(markdown).toContain("**CyberSarah** _(2026-09-10T10:00:05.000Z)_:");
    expect(markdown).toContain("Render-Dienst anlegen und ENV setzen.");
    expect(markdown).toContain("Sitzungen: 1");
  });

  it("neutralisiert Markdown-Injections in Sitzungstiteln", () => {
    const hostile = buildMarkdownExport({
      sessions: [
        { sessionId: "x", title: "### Böser Titel\n\n**Fake**", messages: [{ role: "user", content: "ok", createdAt: "2026-09-10T10:00:00.000Z" }] },
      ],
      format: "markdown",
      exportedAt: "2026-09-10T12:00:00.000Z",
    });
    expect(hostile).not.toContain("### Böser Titel");
    expect(hostile).toContain("## Böser Titel");
  });

  it("erzeugt parse-stabiles JSON mit stabiler Feldreihenfolge", () => {
    const json = buildJsonExport({
      sessions,
      format: "json",
      exportedAt: "2026-09-10T12:00:00.000Z",
    });
    const parsed = JSON.parse(json);
    expect(parsed.export.format).toBe("cybersarah-chat-export");
    expect(parsed.export.version).toBe(1);
    expect(parsed.export.sessions[0].sessionId).toBe("default");
    expect(parsed.export.sessions[0].messages).toHaveLength(2);
    expect(parsed.export.sessions[0].messages[1].provider).toBe("managed");
  });

  it("leitet in buildChatExport Fehler weiter und setzt MIME/Dateinamen korrekt", () => {
    expect(() => buildChatExport({ sessions: [], format: "markdown" })).toThrow(
      "Keine Sitzungen zum Export uebergeben.",
    );
    const markdown = buildChatExport({
      sessions,
      format: "markdown",
      exportedAt: "2026-09-10T12:00:00.000Z",
      userLabel: "hno",
    });
    expect(markdown.mimeType).toBe("text/markdown");
    expect(markdown.filename).toMatch(/^chat-export-hno-/);
    const json = buildChatExport({
      sessions,
      format: "json",
      exportedAt: "2026-09-10T12:00:00.000Z",
      userLabel: "hno",
    });
    expect(json.mimeType).toBe("application/json");
    expect(JSON.parse(json.content).export.sessions).toHaveLength(1);
  });
});
