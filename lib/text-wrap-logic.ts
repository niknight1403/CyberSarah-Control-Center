/**
 * Inserts invisible break opportunities into long, otherwise unbreakable
 * tokens. The visible text is unchanged, while React Native and Web can wrap
 * URLs, connection strings, hashes, and code instead of overflowing bubbles.
 */
const SOFT_BREAK = "\u200B";

function addChunkBreaks(value: string, chunkSize: number): string {
  let result = "";
  let width = 0;
  for (const character of value) {
    result += character;
    if (character === SOFT_BREAK) {
      width = 0;
      continue;
    }
    width += 1;
    if (width >= chunkSize) {
      result += SOFT_BREAK;
      width = 0;
    }
  }
  return result;
}

export function addSoftBreakOpportunities(value: string, chunkSize = 24): string {
  if (!value || chunkSize < 4) return value;
  return value
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      const withSeparatorBreaks = part.replace(/([/\\._:?&=#-])/g, `$1${SOFT_BREAK}`);
      return addChunkBreaks(withSeparatorBreaks, chunkSize);
    })
    .join("");
}
