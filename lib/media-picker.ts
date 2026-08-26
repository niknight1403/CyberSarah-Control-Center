import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { normalizeDocumentResult, normalizeMediaResult, type MediaAttachment, type MediaAttachmentKind } from "@/lib/media-picker-logic";

export { normalizeDocumentResult, normalizeMediaResult } from "@/lib/media-picker-logic";
export type { MediaAttachment, MediaAttachmentKind } from "@/lib/media-picker-logic";

export async function pickDocuments(): Promise<MediaAttachment[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: "*/*", multiple: true, copyToCacheDirectory: true });
  return normalizeDocumentResult(result);
}

export async function pickMedia(kind: Exclude<MediaAttachmentKind, "datei">): Promise<MediaAttachment[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kind === "foto" ? ["images"] : ["videos"],
    allowsMultipleSelection: true,
    quality: 0.8,
  });
  return normalizeMediaResult(kind, result);
}
