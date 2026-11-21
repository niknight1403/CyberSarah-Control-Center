export interface ContentDraftFingerprint {
  topic?: unknown;
  content?: unknown;
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(" ").filter(token => token.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

/** Catches exact and lightly reworded repeats without blocking unrelated content. */
export function isNearDuplicateContent(candidate: ContentDraftFingerprint, previous: ContentDraftFingerprint): boolean {
  if (typeof candidate.content !== "string" || typeof previous.content !== "string") return false;
  const currentText = normalize(candidate.content);
  const previousText = normalize(previous.content);
  if (currentText.length < 40 || previousText.length < 40) return false;
  if (currentText === previousText) return true;
  const topicA = typeof candidate.topic === "string" ? normalize(candidate.topic) : "";
  const topicB = typeof previous.topic === "string" ? normalize(previous.topic) : "";
  const similarity = jaccard(tokens(currentText), tokens(previousText));
  return topicA.length > 0 && topicA === topicB ? similarity >= 0.72 : similarity >= 0.88;
}
