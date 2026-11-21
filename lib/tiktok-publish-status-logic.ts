export type TikTokPublishStatusResult =
  | { state: "complete"; externalId: string }
  | { state: "pending" }
  | { state: "failed"; reason: string };

/** Resolve TikTok's asynchronous publish status; an init publish_id alone is not proof. */
export function resolveTikTokPublishStatus(
  payload: unknown,
  publishId: string,
): TikTokPublishStatusResult {
  if (!payload || typeof payload !== "object") throw new Error("TikTok-Statusantwort fehlt.");
  const root = payload as { error?: { code?: unknown; message?: unknown }; data?: {
    status?: unknown; fail_reason?: unknown; publicly_available_post_id?: unknown;
    publicaly_available_post_id?: unknown;
  } };
  const code = root.error?.code;
  if (typeof code === "string" && code !== "ok") {
    throw new Error(`TikTok-Statusabfrage fehlgeschlagen: ${code}`);
  }
  const status = typeof root.data?.status === "string" ? root.data.status : "";
  if (status === "FAILED") {
    return { state: "failed", reason: String(root.data?.fail_reason ?? "unbekannter Fehler") };
  }
  if (status !== "PUBLISH_COMPLETE") return { state: "pending" };
  const ids = root.data?.publicly_available_post_id ?? root.data?.publicaly_available_post_id;
  const publicId = Array.isArray(ids) ? ids.find((value) => typeof value === "string" && value.trim()) : undefined;
  // A completed SELF_ONLY post may have no public post ID. The publish_id is
  // still a provider-issued receipt, but only after PUBLISH_COMPLETE.
  const receipt = typeof publicId === "string" ? publicId.trim() : `tiktok-publish:${publishId.trim()}`;
  if (!receipt || receipt === "tiktok-publish:") throw new Error("TikTok lieferte keine überprüfbare Veröffentlichungsquittung.");
  return { state: "complete", externalId: receipt };
}
