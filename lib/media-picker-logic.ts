import type * as DocumentPicker from "expo-document-picker";
import type * as ImagePicker from "expo-image-picker";

export type MediaAttachmentKind = "datei" | "foto" | "video";

export type MediaAttachment = {
  id: string;
  name: string;
  uri: string;
  kind: MediaAttachmentKind;
  mimeType?: string;
  size?: number;
};

export function normalizeDocumentResult(result: DocumentPicker.DocumentPickerResult): MediaAttachment[] {
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    id: `${asset.uri}-${asset.name}`,
    name: asset.name,
    uri: asset.uri,
    kind: "datei",
    mimeType: asset.mimeType,
    size: asset.size,
  }));
}

export function normalizeMediaResult(kind: Exclude<MediaAttachmentKind, "datei">, result: ImagePicker.ImagePickerResult): MediaAttachment[] {
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    id: `${asset.assetId ?? asset.uri}-${asset.fileName ?? kind}`,
    name: asset.fileName ?? (kind === "foto" ? "Foto" : "Video"),
    uri: asset.uri,
    kind,
    mimeType: asset.mimeType,
  }));
}
