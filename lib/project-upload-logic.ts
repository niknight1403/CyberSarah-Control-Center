import type { MediaAttachment } from "@/lib/media-picker-logic";

export type ProjectContextFile = {
  name: string;
  content: string;
  mimeType?: string;
  size?: number;
};

export const PROJECT_UPLOAD_LIMITS = {
  maxFiles: 24,
  maxFileBytes: 160_000,
  maxTotalBytes: 1_200_000,
  maxContentChars: 120_000,
} as const;

const TEXT_EXTENSIONS = new Set([
  "c", "cc", "conf", "cpp", "css", "csv", "env", "go", "h", "hpp", "html", "ini", "java", "js", "json", "jsx", "md", "mjs", "py", "rb", "rs", "sh", "sql", "toml", "ts", "tsx", "txt", "vue", "xml", "yaml", "yml",
]);

function extensionOf(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? (name.startsWith(".") ? "env" : "");
}

export function isProjectTextFile(attachment: Pick<MediaAttachment, "name" | "mimeType" | "size">) {
  const mimeType = attachment.mimeType?.toLowerCase() ?? "";
  return mimeType.startsWith("text/") || mimeType.includes("json") || mimeType.includes("javascript") || TEXT_EXTENSIONS.has(extensionOf(attachment.name));
}

export function normalizeProjectPath(name: string) {
  const normalized = name.replaceAll("\\", "/").split("/").filter((part) => part && part !== "." && part !== "..").join("/");
  return normalized.slice(-180) || "projektdatei";
}

export function createProjectContextFile(attachment: MediaAttachment, content: string, totalBytes: number): ProjectContextFile {
  return { name: normalizeProjectPath(attachment.name), content: content.slice(0, PROJECT_UPLOAD_LIMITS.maxContentChars - totalBytes), mimeType: attachment.mimeType, size: attachment.size };
}

/**
 * Sprint 53 — Zero-Config-Anhaenge: Nicht-textuelle Dateien (PDF, Bilder,
 * Videos) werden nicht mehr still verworfen, sondern als kompakter
 * Metadaten-Eintrag in den Prompt-Kontext eingespeist. Das Modell weiss
 * dann, dass ein Dokument existiert, und kann gezielt nachfragen.
 */
export type NonTextAttachmentInfo = Pick<MediaAttachment, "name" | "mimeType" | "size">;

export function formatAttachmentBytes(size: number): string {
  if (size >= 1_048_576) return `${(size / 1_048_576).toFixed(1)} MB`;
  if (size >= 1_024) return `${(size / 1_024).toFixed(1)} KB`;
  return `${size} B`;
}

export function describeNonTextAttachment(attachment: NonTextAttachmentInfo): string {
  const parts = [attachment.name];
  if (attachment.mimeType) parts.push(attachment.mimeType);
  if (typeof attachment.size === "number") parts.push(formatAttachmentBytes(attachment.size));
  return parts.join(", ");
}

export function createNonTextContextEntry(attachment: NonTextAttachmentInfo): ProjectContextFile {
  return {
    name: normalizeProjectPath(attachment.name),
    content: `[Nicht-textueller Anhang: ${describeNonTextAttachment(attachment)}. Der Inhalt kann client-seitig nicht als Text gelesen werden — bei Bedarf gezielt nachfragen.]`,
    mimeType: attachment.mimeType,
    size: attachment.size,
  };
}
