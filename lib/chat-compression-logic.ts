export type ChatMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  timestampMs: number;
};

export type CompressedChatHistory = {
  kept: ChatMessage[];
  digest: {
    removedCount: number;
    contentHash: string;
    summary: string;
  } | null;
};

export type CompressionConfig = {
  maxMessages: number;
};

/**
 * Reduziert einen Chat-Verlauf deterministisch auf die jüngsten `maxMessages`
 * Nachrichten. Systemnachrichten bleiben immer erhalten und zählen nicht gegen
 * das Limit. Entfernte Nachrichten werden zu einem stabilen Verdauungseintrag
 * mit Anzahl und FNV-1a-Hash ihres Inhalts zusammengefasst, ohne dass deren
 * Klartext in der Ausgabe verbleibt.
 */
export function compressChatHistory(messages: ChatMessage[], config: CompressionConfig): CompressedChatHistory {
  if (!Array.isArray(messages)) {
    throw new Error("Nachrichten müssen ein Array sein.");
  }
  const maxMessages = Number.isFinite(config.maxMessages) ? Math.floor(config.maxMessages) : 0;
  if (maxMessages < 1) {
    throw new Error("Das Nachrichtenlimit muss mindestens 1 sein.");
  }

  const systemMessages = messages.filter((message) => message?.role === "system");
  const conversation = messages
    .filter((message) => message?.role !== "system")
    .sort((a, b) => a.timestampMs - b.timestampMs);

  if (conversation.length <= maxMessages) {
    const kept = [...systemMessages, ...conversation];
    return { kept, digest: null };
  }

  const removed = conversation.slice(0, conversation.length - maxMessages);
  const keptConversation = conversation.slice(conversation.length - maxMessages);

  const digestSource = removed
    .map((message) => `${message.id}:${message.role}:${message.content}`)
    .join("\n");

  const kept = [...systemMessages, ...keptConversation];
  return {
    kept,
    digest: {
      removedCount: removed.length,
      contentHash: fnv1aHash(digestSource),
      summary: `${removed.length} ältere Nachricht${removed.length === 1 ? "" : "en"} wurden komprimiert.`,
    },
  };
}

/** Stabiler, deterministischer FNV-1a-Hash (32 Bit, hexadezimal). */
export function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
