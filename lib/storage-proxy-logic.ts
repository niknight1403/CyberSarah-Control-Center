/**
 * Validates storage-proxy inputs before a privileged backend lookup or redirect.
 * Keep this pure so path and URL policy can be regression-tested without network access.
 */
const STORAGE_HOST_SUFFIXES = [
  "storage.googleapis.com",
  "amazonaws.com",
  "cloudflarestorage.com",
  "blob.core.windows.net",
];

export function validateStorageObjectKey(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return false;
  if (value.startsWith("/") || value.includes("\\") || value.includes("%")) return false;
  if (/[?#\s\u0000-\u001f\u007f]/.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) =>
    segment.length > 0 &&
    segment !== "." &&
    segment !== ".." &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment)
  );
}

export function validateSignedStorageUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return false;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) return false;
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":")) return false;
    return STORAGE_HOST_SUFFIXES.some((suffix) =>
      hostname === suffix || hostname.endsWith(\`.\${suffix}\`)
    );
  } catch {
    return false;
  }
}
