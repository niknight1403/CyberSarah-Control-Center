import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("production deployment configuration", () => {
  it("uses one repository path and service port for the systemd health check", () => {
    const appService = readProjectFile("deploy/cybersarah.service");
    const healthService = readProjectFile("deploy/cybersarah-health.service");
    const monitor = readProjectFile("scripts/uptime-monitor.sh");

    expect(appService).toContain(
      "WorkingDirectory=/opt/cybersarah-control-center",
    );
    expect(appService).toContain("Environment=PORT=3000");
    expect(healthService).toContain(
      "WorkingDirectory=/opt/cybersarah-control-center",
    );
    expect(healthService).toContain(
      "HEALTH_URL=http://127.0.0.1:3000/api/health",
    );
    expect(monitor).toContain(
      'HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"',
    );
  });

  it("documents the same production path, user, and health endpoint as the units", () => {
    const systemdGuide = readProjectFile("deploy/README-systemd.md");
    const monitoringGuide = readProjectFile("deploy/UPTIME-MONITORING.md");
    const setupScript = readProjectFile("scripts/setup-production-env.sh");
    const easConfig = readProjectFile("eas.json");

    expect(systemdGuide).toContain("/opt/cybersarah-control-center");
    expect(systemdGuide).toContain("cybersarah");
    expect(systemdGuide).not.toContain("/opt/cybersarah/.env");
    expect(monitoringGuide).toContain("http://127.0.0.1:3000/api/health");
    expect(monitoringGuide).not.toContain("127.0.0.1:3001");
    expect(setupScript).toContain('SERVICE_USER="${CYBERSARAH_SERVICE_USER:-cybersarah}"');
    expect(setupScript).toContain('chown "$SERVICE_USER:$SERVICE_GROUP" "$ENV_FILE"');
    expect(setupScript).not.toContain("chown root:root");
    expect(easConfig).toContain('serviceAccountKeyPath": ".secrets/google-play-service-account.json"');
    expect(easConfig).toContain('releaseStatus": "draft"');
  });
});
