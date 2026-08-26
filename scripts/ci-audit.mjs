const endpoint = process.env.EXTERNAL_ACTION_AUDIT_URL?.trim();
const event = {
  eventId: `github-${process.env.GITHUB_RUN_ID ?? "local"}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}`,
  action: process.env.AUDIT_ACTION ?? "ci",
  status: process.env.AUDIT_STATUS ?? "passed",
  repository: process.env.GITHUB_REPOSITORY,
  branch: process.env.GITHUB_REF_NAME,
  commitSha: process.env.GITHUB_SHA,
  runId: process.env.GITHUB_RUN_ID,
  message: process.env.AUDIT_MESSAGE ?? "CI-Lauf abgeschlossen.",
  metadata: {
    workflow: process.env.GITHUB_WORKFLOW ?? "local",
    event: process.env.GITHUB_EVENT_NAME ?? "manual",
    actor: process.env.GITHUB_ACTOR ?? "unknown",
  },
  occurredAt: new Date().toISOString(),
};

if (!endpoint) {
  console.log(JSON.stringify({ scope: "externalActionAuditService", ...event }));
  process.exit(0);
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(process.env.AUDIT_AUTH_TOKEN ? { authorization: `Bearer ${process.env.AUDIT_AUTH_TOKEN}` } : {}),
  },
  body: JSON.stringify(event),
});
if (!response.ok) {
  console.error(`Audit-Event konnte nicht übermittelt werden (${response.status}).`);
  process.exit(1);
}
console.log(`Audit-Event ${event.eventId} akzeptiert.`);
