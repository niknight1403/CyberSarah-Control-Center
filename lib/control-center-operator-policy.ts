/**
 * Operator stop for the combined multi-agent workflow.
 * This switch does not delete pending drafts or revoke existing platform grants.
 */
export function controlCenterAutopilotEnabled(value?: string): boolean {
  return (value ?? "on").trim().toLowerCase() !== "off";
}
export function assertControlCenterAutopilotEnabled(env: Record<string, string | undefined>): void {
  if (!controlCenterAutopilotEnabled(env.CONTROL_CENTER_AUTOPILOT)) {
    throw new Error("Control-Center-Autopilot bewusst pausiert (CONTROL_CENTER_AUTOPILOT=off).");
  }
}
