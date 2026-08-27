import * as FileSystem from "expo-file-system/legacy";
import type { MediaAttachment } from "@/lib/media-picker-logic";
import { createProjectContextFile, isProjectTextFile, PROJECT_UPLOAD_LIMITS, type ProjectContextFile } from "@/lib/project-upload-logic";

export async function readProjectContext(attachments: MediaAttachment[]): Promise<{ files: ProjectContextFile[]; skipped: string[] }> {
  const files: ProjectContextFile[] = [];
  const skipped: string[] = [];
  let totalBytes = 0;

  for (const attachment of attachments.slice(0, PROJECT_UPLOAD_LIMITS.maxFiles)) {
    if (attachment.kind !== "datei" || !isProjectTextFile(attachment)) {
      skipped.push(attachment.name);
      continue;
    }
    if (attachment.size && attachment.size > PROJECT_UPLOAD_LIMITS.maxFileBytes) {
      skipped.push(`${attachment.name} (zu groß)`);
      continue;
    }
    if (totalBytes + (attachment.size ?? 0) > PROJECT_UPLOAD_LIMITS.maxTotalBytes) {
      skipped.push(`${attachment.name} (Gesamtlimit)`);
      continue;
    }
    try {
      const content = await FileSystem.readAsStringAsync(attachment.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const bounded = createProjectContextFile(attachment, content, totalBytes);
      files.push(bounded);
      totalBytes += attachment.size ?? bounded.content.length;
    } catch {
      skipped.push(`${attachment.name} (nicht lesbar)`);
    }
  }

  return { files, skipped };
}

export function formatProjectContext(files: ProjectContextFile[]) {
  if (!files.length) return "";
  return files.map((file) => `\n--- PROJECT FILE: ${file.name} ---\n${file.content}\n--- END PROJECT FILE ---`).join("\n");
}
