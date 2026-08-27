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
