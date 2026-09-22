/**
 * Inserts invisible break opportunities into long, otherwise unbreakable
 * tokens. The visible text is unchanged, while React Native and Web can wrap
 * URLs, connection strings, hashes, and code instead of overflowing bubbles.
 */
const SOFT_BREAK = "\u200B";

export function addSoftBreakOpportunities(value: string, chunkSize = 24): string {
  if (!value || chunkSize < 4) return value;
  return value
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      const withSeparatorBreaks = part.replace(/([/\\._:?&=#-])/g, `$1${SOFT_BREAK}`);
      return withSeparatorBreaks.replace(new RegExp(`(.{${chunkSize}})(?=.)`, "g"), `$1${SOFT_BREAK}`);
    })
    .join("");
}
