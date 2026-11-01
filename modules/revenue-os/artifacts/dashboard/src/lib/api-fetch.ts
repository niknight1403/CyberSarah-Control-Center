/**
 * API-fetch wrapper — verwendet die baseUrl aus setBaseUrl().
 * Alle Dashboard-Seiten importieren diese Funktion statt direktem fetch(),
 * damit die App im APK/WebView korrekt mit dem Remote-Server kommuniziert.
 */
import { customFetch } from "@workspace/api-client-react";
import type { CustomFetchOptions } from "@workspace/api-client-react";

export async function apiFetch<T = unknown>(
  input: string | URL | Request,
  options: CustomFetchOptions = {},
): Promise<T> {
  return customFetch<T>(input, options);
}

export default apiFetch;
