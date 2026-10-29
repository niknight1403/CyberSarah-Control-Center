import {
  classifyReadinessHttp, type MobileReadinessSample,
} from "./mobile-readiness-logic";

export const MOBILE_READINESS_TIMEOUT_MS = 6_000;

export type MobileReadinessProbeOptions = {
  baseUrl: string;
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};

function readinessUrl(baseUrl: string): string | null {
  try {
    const parsed = new URL(baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    // Ignore any build-time configured path, query and fragment.
    return new URL("/api/ready", parsed).toString();
  } catch {
    return null;
  }
}

/** Only a verified readiness response can produce a green status.
 * Untrusted HTML, authorization errors, timeouts and network exceptions fail closed.
 */
export async function probeMobileReadiness({
  baseUrl, fetcher = fetch, now = Date.now, timeoutMs = MOBILE_READINESS_TIMEOUT_MS,
}: MobileReadinessProbeOptions): Promise<MobileReadinessSample> {
  const url = readinessUrl(baseUrl);
  if (!url) return { outcome: "unreachable", checkedAtMs: now() };
  const controller = new AbortController();
  const boundedTimeout = Number.isFinite(timeoutMs) ? Math.min(15_000, Math.max(250, timeoutMs)) : MOBILE_READINESS_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), boundedTimeout);
  try {
    const response = await fetcher(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (response.status !== 200 && response.status !== 503) {
      return { outcome: "unreachable", checkedAtMs: now() };
    }
    const payload: unknown = await response.json();
    return { outcome: classifyReadinessHttp(response.status, payload), checkedAtMs: now() };
  } catch {
    return { outcome: "unreachable", checkedAtMs: now() };
  } finally {
    clearTimeout(timer);
  }
}
