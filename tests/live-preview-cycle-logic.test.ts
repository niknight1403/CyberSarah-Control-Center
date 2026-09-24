import { describe, expect, it } from "vitest";
import {
  createPreviewSession,
  formatPreviewCycleStatusLabel,
  getPreviewCycleBadgeTone,
  restorePreviewSession,
  serializePreviewSession,
  syncChatWithPreviewState,
  transitionPreviewState,
} from "../lib/live-preview-cycle-logic";

describe("live-preview-cycle-logic (Sprint 284)", () => {
  it("erstellt eine neue Preview-Sitzung deterministisch", () => {
    const session = createPreviewSession({ chatSessionId: "chat-100", nowMs: 1700000000000 });
    expect(session.chatSessionId).toBe("chat-100");
    expect(session.status).toBe("idle");
    expect(session.activeUrl).toBeNull();
    expect(session.version).toBe(1);
    expect(session.history).toHaveLength(1);
    expect(session.history[0].status).toBe("idle");
  });

  it("erstellt eine Sitzung mit initialer URL direkt als ready", () => {
    const session = createPreviewSession({ initialUrl: "https://preview.dev", nowMs: 1700000000000 });
    expect(session.status).toBe("ready");
    expect(session.activeUrl).toBe("https://preview.dev");
  });

  it("fuehrt Zustandsübergänge ohne Zustandsverlust aus", () => {
    const initial = createPreviewSession({ nowMs: 1000 });
    const building = transitionPreviewState(initial, "building", { logMessage: "Starte Vite" }, 2000);
    expect(building.status).toBe("building");
    expect(building.version).toBe(2);
    expect(building.history).toHaveLength(2);

    const ready = transitionPreviewState(
      building,
      "ready",
      { url: "https://app.preview.local", buildOutput: "Build 0 Fehler" },
      3000
    );
    expect(ready.status).toBe("ready");
    expect(ready.activeUrl).toBe("https://app.preview.local");
    expect(ready.buildOutput).toBe("Build 0 Fehler");
    expect(ready.version).toBe(3);
    expect(ready.history).toHaveLength(3);
  });

  it("formatiert Status-Labels und Badges korrekt", () => {
    expect(formatPreviewCycleStatusLabel("ready")).toBe("Live-Vorschau aktiv");
    expect(formatPreviewCycleStatusLabel("error")).toBe("Vorschau-Fehler");

    expect(getPreviewCycleBadgeTone("ready")).toBe("ready");
    expect(getPreviewCycleBadgeTone("building")).toBe("neutral");
    expect(getPreviewCycleBadgeTone("error")).toBe("warning");
  });

  it("synchronisiert Chat und Preview-Status deterministisch", () => {
    const session = createPreviewSession({ chatSessionId: "chat-1", initialUrl: "https://preview.dev", nowMs: 1000 });

    const state1 = syncChatWithPreviewState({ sessionId: "chat-1", isAgentTyping: false }, session);
    expect(state1.previewActive).toBe(true);
    expect(state1.statusBadge).toBe("Live-Vorschau aktiv");
    expect(state1.summary).toContain("https://preview.dev");

    const stateTyping = syncChatWithPreviewState({ sessionId: "chat-1", isAgentTyping: true }, session);
    expect(stateTyping.statusBadge).toBe("Build wird vorbereitet …");

    const stateOtherChat = syncChatWithPreviewState({ sessionId: "chat-2", isAgentTyping: false }, session);
    expect(stateOtherChat.summary).toBe("Vorschau stammt aus einer früheren Chat-Sitzung.");
  });

  it("serialisiert und stellt Sitzungen sicher wieder her", () => {
    const session = createPreviewSession({ chatSessionId: "chat-abc", initialUrl: "https://a.b" });
    const serialized = serializePreviewSession(session);
    const restored = restorePreviewSession(serialized);

    expect(restored).not.toBeNull();
    expect(restored?.id).toBe(session.id);
    expect(restored?.activeUrl).toBe("https://a.b");

    expect(restorePreviewSession("invalid json")).toBeNull();
    expect(restorePreviewSession("")).toBeNull();
  });
});
