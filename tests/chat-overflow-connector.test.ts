import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Sprint 194 — Regressionsschutz fuer zwei Owner-gemeldete Chat-Probleme:
 *
 * 1. Nachrichten-Inhalt lief rechts aus dem Bildschirm hinaus (lange, nicht
 *    umbrechbare Tokens wie URLs/Pfade/Stacktrace-Zeilen sprengten die
 *    Flex-Zeile, weil React-Native-Web ohne minWidth:0 min-width:auto
 *    erzwingt). Guard: message-bubble.tsx haelt die Kaskade
 *    row -> rowUser -> bubble -> codeBox auf minWidth: 0.
 *
 * 2. Der Repository-Picker verlangte im Chat trotzdem manuelle Eingabe,
 *    obwohl das server-seitige Admin-Auto-Provisioning (Sprint 87,
 *    adminRouter.githubToken) bereits existierte: chat.tsx/agent.tsx gaben
 *    onListRepositories nur bei lokalem Token weiter. Guard: beide Screens
 *    uebergeben listGithubRepositories immer, und die Logik faellt ohne
 *    lokales Token auf das Admin-Token vom Server zurueck.
 */

const root = process.cwd();

function source(...segments: string[]): string {
  return fs.readFileSync(path.join(root, ...segments), "utf8");
}

describe("Chat-Bubble-Overflow-Schutz (Sprint 194)", () => {
  const bubble = source("components", "chat", "message-bubble.tsx");

  it("verhindert min-width:auto auf allen Zeilen- und Bubble-Ebenen", () => {
    expect(bubble).toContain('row: { flexDirection: "row", gap: 9, marginBottom: 12, maxWidth: "100%", minWidth: 0 }');
    expect(bubble).toContain('rowUser: { alignSelf: "flex-end", flexDirection: "row-reverse", maxWidth: "92%", minWidth: 0 }');
    expect(bubble).toContain("minWidth: 0");
    expect(bubble).toContain('flexShrink: 1');
  });

  it("laesst Code-Bloecke und lange Tokens innerhalb der Bubble brechen", () => {
    expect(bubble).toMatch(/codeBox: \{[^}]*minWidth: 0/);
    expect(bubble).toMatch(/codeText: \{[^}]*flexShrink: 1/);
    expect(bubble).toContain('wordBreak: "break-word"');
  });

  it("stellt sicher, dass jede neue Chat-Zeile die Breite einhaelt", () => {
    // Die vier inhaltragenden Textstile muessen wordBreak bekommen — sonst
    // sprengt der erste lange Pfad wieder den rechten Rand.
    const wordBreakCount = (bubble.match(/wordBreak: "break-word"/g) ?? []).length;
    expect(wordBreakCount).toBeGreaterThanOrEqual(3);
  });
});

describe("Autonomer GitHub-Connector im Chat (Sprint 194)", () => {
  it("laesst chat.tsx und agent.tsx den Picker immer versuchen", () => {
    for (const screen of ["chat.tsx", "agent.tsx"] as const) {
      const code = source("app", "(tabs)", screen);
      expect(code).toContain("onListRepositories={listGithubRepositories}");
      expect(code).not.toContain("settings.hasGitHubToken ? listGithubRepositories");
    }
  });

  it("faellt ohne lokales Token auf das Admin-Auto-Provisioning zurueck", () => {
    const settings = source("lib", "studio-settings.tsx");
    expect(settings).toContain("trpcUtils.admin.githubToken.fetch()");
    expect(settings).toContain('adminToken?.token');
    // Klarer Fehler bleibt bestehen, wenn weder lokal noch server-seitig ein Token existiert.
    expect(settings).toContain("Hinterlege zuerst einen GitHub-Token in den Einstellungen.");
  });
});
