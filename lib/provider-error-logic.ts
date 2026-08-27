export type ProviderErrorKind = "timeout" | "authentication" | "network" | "configuration" | "rate-limit" | "unknown";

export type ProviderErrorResult = {
  kind: ProviderErrorKind;
  retryable: boolean;
  message: string;
};

type ErrorShape = {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  name?: unknown;
};

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asStatus(error: ErrorShape) {
  const value = error.status ?? error.statusCode;
  return typeof value === "number" ? value : Number(value) || 0;
}

function safeMessage(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/(?:sk|AIza|gho|hf|gsk)_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/https?:\/\/[^\s]+/gi, "[endpoint redacted]")
    .slice(0, 180);
}

export function classifyProviderError(input: unknown): ProviderErrorResult {
  const error = (input && typeof input === "object" ? input : {}) as ErrorShape;
  const message = safeMessage(asText(error.message) || asText(error.name) || "Unbekannter Provider-Fehler");
  const code = asText(error.code).toLowerCase();
  const status = asStatus(error);
  const normalized = message.toLowerCase();

  if (code === "etimedout" || code === "timeout" || normalized.includes("timeout") || normalized.includes("timed out")) {
    return { kind: "timeout", retryable: true, message: "Der Provider hat nicht rechtzeitig geantwortet." };
  }
  if (status === 401 || status === 403 || code === "unauthorized" || normalized.includes("unauthorized") || normalized.includes("invalid api key")) {
    return { kind: "authentication", retryable: false, message: "Die Provider-Anmeldedaten wurden abgelehnt." };
  }
  if (status === 429 || code === "rate_limit" || normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return { kind: "rate-limit", retryable: true, message: "Das Provider-Limit wurde erreicht; später erneut versuchen." };
  }
  if (code === "enotfound" || code === "econnrefused" || code === "econnreset" || normalized.includes("network") || normalized.includes("fetch failed") || normalized.includes("connection")) {
    return { kind: "network", retryable: true, message: "Der Provider-Endpoint ist momentan nicht erreichbar." };
  }
  if (status === 400 || code === "invalid_endpoint" || normalized.includes("invalid endpoint") || normalized.includes("configuration")) {
    return { kind: "configuration", retryable: false, message: "Die Provider-Konfiguration ist ungültig." };
  }
  return { kind: "unknown", retryable: false, message: message === "Unbekannter Provider-Fehler" ? message : "Der Provider-Aufruf ist fehlgeschlagen." };
}
