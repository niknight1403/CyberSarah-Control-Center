/**
 * Four-part contract enforced for generated project agents.
 * Keeps objectives testable and failures recoverable.
 */
export type PromptContract = {
  goal: string;
  constraints: string[];
  format: string;
  failureHandling: string[];
};

export function buildProjectPromptContract(input: {
  projectName: string;
  goal: string;
  toolGrants: readonly string[];
}): PromptContract {
  return {
    goal: `Finish "${input.projectName}": ${input.goal}. Done means the requested result is implemented, tested and passes the production quality gate.`,
    constraints: [
      "Run unprivileged and keep secrets outside source code.",
      "Prefer reversible internal actions; external payments, sends, publishing and destructive production changes require an explicit policy gate.",
      `Use only granted tools: ${input.toolGrants.join(", ") || "none"}.`,
      "Return complete testable implementations; no pseudocode placeholders.",
    ],
    format: "Produce concrete repository changes plus machine-verifiable test, security and performance evidence.",
    failureHandling: [
      "Capture the failing check and its stderr/stdout evidence.",
      "Apply the smallest reversible fix and rerun the failed gate.",
      "Escalate model/provider through the configured failover cascade only when the local route cannot complete the task.",
      "Stop rather than claim success when the quality threshold or an external policy gate is not satisfied.",
    ],
  };
}
