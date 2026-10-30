/**
 * Audit logs are not a place for provider credentials or private contact data.
 * Mask before server logs and GitHub incident summaries; do not mutate persisted records.
 */
export function redactAutopilotLog(input: unknown): string {
  const source = typeof input === "string" ? input : input instanceof Error ? input.message : String(input ?? "");
  return source
    .replace(/\bBearer\s+[\w.\/+~=-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|rk)_(?:test|live)_[a-zA-Z0-9]{6,}/g, "[STRIPE_SECRET]")
    .replace(/\bwhsec_[a-zA-Z0-9]{6,}/g, "[STRIPE_WEBHOOK_SECRET]")
    .replace(/\b(?:api[_-]?key|access[_-]?token|secret|password)=([^\s&]+)/gi, (_match, _value) => "credential=[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .slice(0, 500);
}
