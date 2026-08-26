import { useCallback, useState } from "react";
import { pickDocuments, pickMedia, type MediaAttachment, type MediaAttachmentKind } from "@/lib/media-picker";

export function useMediaPicker() {
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (operation: () => Promise<MediaAttachment[]>) => {
    setBusy(true);
    try {
      return await operation();
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    busy,
    pickFiles: () => run(pickDocuments),
    pickPhotos: () => run(() => pickMedia("foto")),
    pickVideos: () => run(() => pickMedia("video")),
    pick: (kind: MediaAttachmentKind) => kind === "datei" ? run(pickDocuments) : run(() => pickMedia(kind)),
  };
}
