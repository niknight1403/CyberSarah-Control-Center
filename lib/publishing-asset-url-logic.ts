/**
 * Prevent accidental publication of local, plaintext or non-media endpoints.
 * Provider-side downloads must only receive HTTPS URLs with public DNS names.
 * This is a syntactic gate: remote DNS rebinding and media content type still
 * require runtime provider or network controls.
 */
export type MediaUrlReview = { valid: true; type: "image" | "video" } |
  { valid: false; reason: string };

const IMAGE_EXT = /\.(?:jpe?g|png|webp)$/i;
const VIDEO_EXT = /\.(?:mp4|mov)$/i;
const PUBLIC_HOSTNAME = /^(?=.{4,253}$)[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const INTERNAL_SUFFIX = /\.(?:localhost|local|internal|test|invalid|example)$/i;

export function reviewPublishingMediaUrl(value: string): MediaUrlReview {
  if (!value || value.length > 1000) return { valid:false, reason:"Asset-URL fehlt oder ist zu lang." };
  let url: URL;
  try { url = new URL(value.trim()); }
  catch { return {valid:false,reason:"Asset-URL ist keine absolute HTTPS-URL."}; }
  if (url.protocol !== "https:")
    return {valid:false,reason:"Publishing-Assets müssen über HTTPS öffentlich erreichbar sein."};
  if (url.username || url.password || url.port || url.hash)
    return {valid:false,reason:"Asset-URL mit Zugangsdaten, Sonderport oder Fragment unzulässig."};
  const hostname = url.hostname.toLowerCase().replace(/\.$/,"");
  if (!PUBLIC_HOSTNAME.test(hostname) || INTERNAL_SUFFIX.test(hostname) ||
      hostname==="localhost" || /^(?:\d+\.){3}\d+$/.test(hostname) ||
      hostname.startsWith("xn--") && hostname.endsWith(".internal"))
    return {valid:false,reason:"Asset-Host muss eine öffentliche DNS-Domain sein."};
  const labels = hostname.split(".");
  if (labels.some(label => label.startsWith("-") || label.endsWith("-")))
    return {valid:false,reason:"Asset-Host ist keine gültige DNS-Domain."};
  if (IMAGE_EXT.test(url.pathname)) return {valid:true,type:"image"};
  if (VIDEO_EXT.test(url.pathname)) return {valid:true,type:"video"};
  return {valid:false,reason:"Publishing-Asset braucht .jpg, .jpeg, .png, .webp, .mp4 oder .mov."};
}

export function assertPublishingMediaUrls(assetUrl?: string | null, assetUrls?: string[]): void {
  const candidates = [ ...(assetUrl ? [assetUrl] : []), ...(assetUrls ?? []) ];
  if ((assetUrls?.length ?? 0) > 10)
    throw new Error("Höchstens zehn Publishing-Assets pro Kampagne.");
  for (const candidate of candidates) {
    const result = reviewPublishingMediaUrl(candidate);
    if (!result.valid) throw new Error(result.reason);
  }
  for (const candidate of assetUrls ?? []) {
    const result = reviewPublishingMediaUrl(candidate);
    if (!result.valid || result.type !== "image")
      throw new Error("Mehrteilige Publishing-Carousels benötigen ausschließlich öffentliche HTTPS-Bilder.");
  }
}
