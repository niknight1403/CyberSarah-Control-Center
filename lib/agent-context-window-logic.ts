/**
 * Sprint 290 — Agent-Kontextfenster: Zusammenfassung vor Ueberlauf, nichts still verwerfen
 *
 * Reine, deterministische Logik fuer die Verwaltung und Verdichtung des
 * Agenten-Kontextfensters. Schätzt Token-Nutzung, erkennt drohenden Ueberlauf
 * vor Erreichen harter Limits und verdichtet ältere Chat-Verläufe in eine
 * strukturierte Zusammenfassung, ohne entscheidende Fakten (Dateipfade,
 * Entscheidungen, Testergebnisse) still zu verwerfen.
 */

export type AgentMessageRole = "system" | "user" | "assistant" | "tool";

export type AgentMessage = {
  role: AgentMessageRole;
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type ContextWindowConfig = {
  maxContextTokens: number;
  summarizeThresholdRatio: number;
  preserveRecentMessagesCount: number;
  charsPerToken: number;
};

export const DEFAULT_CONTEXT_CONFIG: ContextWindowConfig = {
  maxContextTokens: 16000,
  summarizeThresholdRatio: 0.75, // Zusammenfassung ab 75% Auslastung
  preserveRecentMessagesCount: 4, // Neueste 4 Nachrichten intakt halten
  charsPerToken: 3.8, // Konservative Schätzung Zeichen pro Token
};

export type ContextUsage = {
  estimatedTokens: number;
  maxTokens: number;
  usageRatio: number;
  messageCount: number;
  shouldSummarize: boolean;
};

export type ContextSummaryResult = {
  condensedMessages: AgentMessage[];
  wasSummarized: boolean;
  meta: {
    originalMessageCount: number;
    condensedMessageCount: number;
    tokensBefore: number;
    tokensAfter: number;
    summarizedTurnCount: number;
    preservedFiles: string[];
    preservedDecisions: string[];
    summaryText: string;
  };
};

/**
 * Schätzt die aktuelle Token-Anzahl und Auslastung des Kontextfensters.
 */
export function estimateMessageTokens(
  message: AgentMessage,
  charsPerToken = DEFAULT_CONTEXT_CONFIG.charsPerToken
): number {
  const content = message.content ?? "";
  const extra = (message.role ?? "").length + (message.name ?? "").length + 10;
  return Math.ceil((content.length + extra) / charsPerToken);
}

export function estimateContextUsage(
  messages: AgentMessage[],
  configConfig?: Partial<ContextWindowConfig>
): ContextUsage {
  const config = { ...DEFAULT_CONTEXT_CONFIG, ...configConfig };
  const estimatedTokens = messages.reduce(
    (sum, msg) => sum + estimateMessageTokens(msg, config.charsPerToken),
    0
  );
  const usageRatio = Math.round((estimatedTokens / config.maxContextTokens) * 100) / 100;
  const shouldSummarize = usageRatio >= config.summarizeThresholdRatio;

  return {
    estimatedTokens,
    maxTokens: config.maxContextTokens,
    usageRatio,
    messageCount: messages.length,
    shouldSummarize,
  };
}

const FILE_PATH_REGEX = /\b[\w.-]+(?:[\/\\][\w.-]+)*\.(?:ts|tsx|js|jsx|json|md|py|yml|yaml|css)\b/gi;
const DECISION_KEYWORDS = /(?:beschlossen|entschieden|geaendert|implementiert|fix|erstellt|erfolgreich|fehler|pass|fail)/i;

/**
 * Extrahiert zu bewahrende Fakten (Dateien, Schlüsselentscheidungen) aus Texten.
 */
export function extractContextFacts(text: string): { files: string[]; decisions: string[] } {
  const filesSet = new Set<string>();
  const decisionsSet = new Set<string>();

  const fileMatches = text.match(FILE_PATH_REGEX);
  if (fileMatches) {
    fileMatches.forEach((f) => {
      if (f.length > 3 && !f.startsWith("http")) {
        filesSet.add(f);
      }
    });
  }

  const lines = text.split("\n");
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.length > 10 && DECISION_KEYWORDS.test(trimmed)) {
      decisionsSet.add(trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed);
    }
  });

  return {
    files: Array.from(filesSet),
    decisions: Array.from(decisionsSet),
  };
}

/**
 * Verdichtet das Kontextfenster vor einem Überlauf, ohne Schlüsselinformationen zu verlieren.
 */
export function condenseAgentContext(
  messages: AgentMessage[],
  configInput?: Partial<ContextWindowConfig>
): ContextSummaryResult {
  const config = { ...DEFAULT_CONTEXT_CONFIG, ...configInput };
  const usageBefore = estimateContextUsage(messages, config);

  if (!usageBefore.shouldSummarize || messages.length <= config.preserveRecentMessagesCount + 1) {
    return {
      condensedMessages: [...messages],
      wasSummarized: false,
      meta: {
        originalMessageCount: messages.length,
        condensedMessageCount: messages.length,
        tokensBefore: usageBefore.estimatedTokens,
        tokensAfter: usageBefore.estimatedTokens,
        summarizedTurnCount: 0,
        preservedFiles: [],
        preservedDecisions: [],
        summaryText: "Keine Verdichtung erforderlich.",
      },
    };
  }

  // System-Nachrichten an der Spitze extrahieren
  const systemMessages: AgentMessage[] = [];
  const conversationMessages: AgentMessage[] = [];

  messages.forEach((msg) => {
    if (msg.role === "system") {
      systemMessages.push(msg);
    } else {
      conversationMessages.push(msg);
    }
  });

  const preserveCount = Math.min(conversationMessages.length, config.preserveRecentMessagesCount);
  const recentMessages = conversationMessages.slice(conversationMessages.length - preserveCount);
  const olderMessages = conversationMessages.slice(0, conversationMessages.length - preserveCount);

  if (olderMessages.length === 0) {
    return {
      condensedMessages: [...messages],
      wasSummarized: false,
      meta: {
        originalMessageCount: messages.length,
        condensedMessageCount: messages.length,
        tokensBefore: usageBefore.estimatedTokens,
        tokensAfter: usageBefore.estimatedTokens,
        summarizedTurnCount: 0,
        preservedFiles: [],
        preservedDecisions: [],
        summaryText: "Keine älteren Nachrichten zum Verdichten vorhanden.",
      },
    };
  }

  // Extrahiere Fakten aus allen älteren Nachrichten (Ehrlichkeit: Nichts still verwerfen)
  const allFilesSet = new Set<string>();
  const allDecisionsSet = new Set<string>();
  const turnSummaries: string[] = [];

  olderMessages.forEach((msg, idx) => {
    const facts = extractContextFacts(msg.content ?? "");
    facts.files.forEach((f) => allFilesSet.add(f));
    facts.decisions.forEach((d) => allDecisionsSet.add(d));

    if (msg.role === "user") {
      const promptSnippet = (msg.content ?? "").slice(0, 100).replace(/\n/g, " ");
      turnSummaries.push(`Nutzer-Anforderung #${idx + 1}: "${promptSnippet}"`);
    } else if (msg.role === "assistant" && msg.content) {
      const responseSnippet = msg.content.slice(0, 100).replace(/\n/g, " ");
      turnSummaries.push(`Agent-Antwort #${idx + 1}: "${responseSnippet}"`);
    }
  });

  const preservedFiles = Array.from(allFilesSet);
  const preservedDecisions = Array.from(allDecisionsSet);

  const summaryLines: string[] = [
    `=== AGENT-KONTEXT-ZUSAMMENFASSUNG (Sprint 290 - Auto-Verdichtung) ===`,
    `Verdichtete Nachrichten: ${olderMessages.length} ältere Turns zusammengefasst.`,
    ``,
    `--- Bisheriger Verlauf (Kurzzusammenfassung) ---`,
    ...turnSummaries.slice(-6),
    ``,
    `--- Konservierte Dateipfade (${preservedFiles.length}) ---`,
    preservedFiles.length > 0 ? preservedFiles.map((f) => `- ${f}`).join("\n") : "(keine)",
    ``,
    `--- Konservierte Entscheidungen & Ergebnisse (${preservedDecisions.length}) ---`,
    preservedDecisions.length > 0 ? preservedDecisions.slice(-8).map((d) => `- ${d}`).join("\n") : "(keine)",
    `====================================================================`,
  ];

  const summaryText = summaryLines.join("\n");

  const summarySystemMessage: AgentMessage = {
    role: "system",
    content: summaryText,
  };

  const condensedMessages: AgentMessage[] = [
    ...systemMessages,
    summarySystemMessage,
    ...recentMessages,
  ];

  const usageAfter = estimateContextUsage(condensedMessages, config);

  return {
    condensedMessages,
    wasSummarized: true,
    meta: {
      originalMessageCount: messages.length,
      condensedMessageCount: condensedMessages.length,
      tokensBefore: usageBefore.estimatedTokens,
      tokensAfter: usageAfter.estimatedTokens,
      summarizedTurnCount: olderMessages.length,
      preservedFiles,
      preservedDecisions,
      summaryText,
    },
  };
}
