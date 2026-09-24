import { describe, expect, it } from "vitest";
import {
  estimateContextUsage,
  extractContextFacts,
  condenseAgentContext,
  AgentMessage,
} from "../lib/agent-context-window-logic";

describe("Sprint 290 — Agent-Kontextfenster-Verdichtung", () => {
  it("schätzt Token-Nutzung und erkennt Schwellenwerte korrekt", () => {
    const messages: AgentMessage[] = [
      { role: "system", content: "Du bist CyberSarah." },
      { role: "user", content: "Implementiere eine neue Funktion." },
    ];

    const usage = estimateContextUsage(messages, { maxContextTokens: 100 });
    expect(usage.estimatedTokens).toBeGreaterThan(0);
    expect(usage.shouldSummarize).toBe(false);

    // Langer Text fuer Schwellenwert-Ueberschreitung
    const longMessages: AgentMessage[] = [
      { role: "system", content: "A".repeat(200) },
      { role: "user", content: "B".repeat(300) },
    ];
    const usageLong = estimateContextUsage(longMessages, { maxContextTokens: 100, summarizeThresholdRatio: 0.5 });
    expect(usageLong.shouldSummarize).toBe(true);
  });

  it("extrahiert Dateipfade und Entscheidungs-Fakten ohne Verlust", () => {
    const text = `
    Wir haben lib/dev-agent-tools-logic.ts und tests/code-search-logic.test.ts angepasst.
    Es wurde beschlossen: Multi-File Rollback ist aktiv.
    Tests ausführen: 1572 tests pass.
    `;

    const facts = extractContextFacts(text);
    expect(facts.files).toContain("lib/dev-agent-tools-logic.ts");
    expect(facts.files).toContain("tests/code-search-logic.test.ts");
    expect(facts.decisions.some((d) => d.includes("beschlossen"))).toBe(true);
  });

  it("verdichtet alte Verläufe und behält System-Prompt + neueste Nachrichten intakt", () => {
    const messages: AgentMessage[] = [
      { role: "system", content: "System-Instruction" },
      { role: "user", content: "Erstelle lib/service1.ts fuer Feature 1" },
      { role: "assistant", content: "lib/service1.ts wurde erfolgreich erstellt. Tests pass." },
      { role: "user", content: "Erstelle lib/service2.ts fuer Feature 2" },
      { role: "assistant", content: "lib/service2.ts wurde erstellt." },
      { role: "user", content: "Erstelle lib/service3.ts" },
      { role: "assistant", content: "lib/service3.ts erstellt." },
      { role: "user", content: "Neueste Anfrage: Zeige Status" },
      { role: "assistant", content: "Hier ist der Status der 3 Services." },
    ];

    const result = condenseAgentContext(messages, {
      maxContextTokens: 100, // künstlich niedrig, um Verdichtung auszulösen
      summarizeThresholdRatio: 0.1,
      preserveRecentMessagesCount: 2,
    });

    expect(result.wasSummarized).toBe(true);
    expect(result.condensedMessages.length).toBeLessThan(messages.length);

    // System-Prompt muss an Pos 0 bleiben
    expect(result.condensedMessages[0].content).toBe("System-Instruction");

    // Zusammenfassungs-System-Message muss vorhanden sein
    const summaryMsg = result.condensedMessages[1];
    expect(summaryMsg.role).toBe("system");
    expect(summaryMsg.content).toContain("AGENT-KONTEXT-ZUSAMMENFASSUNG");

    // Konservierte Dateien muessen im Meta enthalten sein
    expect(result.meta.preservedFiles).toContain("lib/service1.ts");
    expect(result.meta.preservedFiles).toContain("lib/service2.ts");

    // Neueste 2 Nachrichten muessen unverändert am Ende stehen
    const lastTwo = result.condensedMessages.slice(-2);
    expect(lastTwo[0].content).toBe("Neueste Anfrage: Zeige Status");
    expect(lastTwo[1].content).toBe("Hier ist der Status der 3 Services.");
  });
});
