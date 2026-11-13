/**
 * Network-status policy for the production integration audit.
 *
 * Render can answer with a gateway error while a sleeping instance is being
 * started. These responses are transient just like a connection timeout and
 * must not turn the daily audit red before its retry budget is exhausted.
 */
export function shouldRetryAuditStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}
