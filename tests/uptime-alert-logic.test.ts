import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-ignore Deploy-/Alert-Logik ist bewusst reines ESM ohne Typen.
import {
  buildAlertComment,
  buildAlertIssueBody,
  buildAlertTitle,
  buildDiscordMessage,
  classifyHealthResponse,
  isSuspensionResponse,
} from "../lib/uptime-alert-logic.mjs";

const SUSPENSION_PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><title>Service Suspended</title></head>
<body>This service has been suspended by its owner.</body></html>`;

describe("uptime-alert-logic: isSuspensionResponse", () => {
  it("erkennt die Render-Suspensionsseite unabhaengig von HTML-Gerippe", () => {
    expect(isSuspensionResponse(SUSPENSION_PAGE)).toBe(true);
    expect(isSuspensionResponse("This service has been suspended by its owner.")).toBe(true);
    expect(isSuspensionResponse("<p>The service is suspended</p>")).toBe(true);
    expect(isSuspensionResponse("SUSPENDED BY ITS OWNER")).toBe(true);
  });

  it("verwechselt gewoehnliche Ausfallseiten nicht mit einer Suspension", () => {
    expect(isSuspensionResponse("<html><body>Application error</body></html>")).toBe(false);
    expect(isSuspensionResponse('{"status":"error","message":"database unavailable"}')).toBe(false);
    expect(isSuspensionResponse("")).toBe(false);
    expect(isSuspensionResponse(undefined)).toBe(false);
    expect(isSuspensionResponse(null)).toBe(false);
    expect(isSuspensionResponse(503)).toBe(false);
  });
});

describe("uptime-alert-logic: classifyHealthResponse", () => {
  it("meldet HTTP 200 als gruen", () => {
    const result = classifyHealthResponse({ status: 200, body: '{"status":"ok"}' });
    expect(result.kind).toBe("ok");
    expect(result.httpStatus).toBe(200);
    expect(result.transient).toBe(false);
    expect(result.ownerActionRequired).toBe(false);
    expect(result.ownerAction).toBe("");
  });

  it("ordnet die Suspendierung als Plattform-Ereignis mit Eigentuemer-Aktion ein", () => {
    const result = classifyHealthResponse({ status: 503, body: SUSPENSION_PAGE });
    expect(result.kind).toBe("platform_suspended");
    expect(result.httpStatus).toBe(503);
    expect(result.transient).toBe(false);
    expect(result.ownerActionRequired).toBe(true);
    expect(result.headline).toContain("suspendiert");
    expect(result.ownerAction).toContain("Render-Dashboard");
    expect(result.ownerAction).toContain("only services suspended by a user can be resumed");
  });

  it("erkennt die Suspension auch bei Status 200-fremden Codes und ohne Status", () => {
    expect(classifyHealthResponse({ status: "503", body: SUSPENSION_PAGE }).kind).toBe("platform_suspended");
    expect(classifyHealthResponse({ body: SUSPENSION_PAGE }).kind).toBe("platform_suspended");
  });

  it("behandelt 502/503/504 ohne Marker als voruebergehenden Gateway-Fehler", () => {
    for (const status of [502, 503, 504]) {
      const result = classifyHealthResponse({ status, body: "<html>upstream connect error</html>" });
      expect(result.kind).toBe("gateway_error");
      expect(result.transient).toBe(true);
      expect(result.ownerActionRequired).toBe(false);
    }
  });

  it("behandelt fehlende Antworten als unerreichbar", () => {
    for (const status of [undefined, null, "", "000", 0, Number.NaN]) {
      const result = classifyHealthResponse({ status, body: "" });
      expect(result.kind).toBe("unreachable");
      expect(result.httpStatus).toBeNull();
      expect(result.transient).toBe(true);
    }
  });

  it("behandelt sonstige Status als HTTP-Fehler ohne Eigentuemer-Pflicht", () => {
    const result = classifyHealthResponse({ status: 500, body: '{"error":"boom"}' });
    expect(result.kind).toBe("http_error");
    expect(result.httpStatus).toBe(500);
    expect(result.ownerAction).toContain("Logs");
    expect(classifyHealthResponse({ status: 404 }).kind).toBe("http_error");
  });

  it("ist robust gegen fehlende Eingaben", () => {
    expect(classifyHealthResponse(undefined).kind).toBe("unreachable");
    expect(classifyHealthResponse({}).kind).toBe("unreachable");
  });
});

describe("uptime-alert-logic: Issue-Texte", () => {
  const suspended = classifyHealthResponse({ status: 503, body: SUSPENSION_PAGE });
  const gateway = classifyHealthResponse({ status: 503, body: "<html>bad gateway</html>" });

  it("waehlt bei Suspension einen eigenen, handlungsleitenden Titel", () => {
    expect(buildAlertTitle(suspended)).toContain("suspendiert");
    expect(buildAlertTitle(gateway)).toBe("🚨 Produktiv-Ausfall: app.cybersarah-ki.com nicht erreichbar");
  });

  it("nennt im Suspensions-Issue ausdruecklich den einzigen wirksamen Schritt", () => {
    const body = buildAlertIssueBody({
      healthUrl: "https://app.cybersarah-ki.com/api/health",
      classification: suspended,
      timestamp: "2026-11-28 04:20 UTC",
    });
    expect(body).toContain("HTTP-Status: `503`");
    expect(body).toContain("2026-11-28 04:20 UTC");
    expect(body).toContain("kein Code- oder Deploy-Problem");
    expect(body).toContain("Naechster Schritt (Eigentuemer)");
    expect(body).toContain("Render-Dashboard");
    expect(body).not.toContain("reagiert Render evtl. gerade neu");
  });

  it("baut fuer andere Ausfaelle einen generischen Text mit Hinweis auf die Diagnose", () => {
    const body = buildAlertIssueBody({ healthUrl: "https://x/api/health", classification: gateway, timestamp: "T" });
    expect(body).toContain("https://x/api/health");
    expect(body).toContain("render-diagnose.yml");
    expect(body).not.toContain("Eigentuemer");
  });

  it("kuerzt und bereinigt den Antwortkoerper fuer das Issue", () => {
    const body = buildAlertIssueBody({
      healthUrl: "https://x/api/health",
      classification: suspended,
      timestamp: "T",
      bodyExcerpt: `<html><style>.a{}</style><body>${"x".repeat(900)}</body></html>`,
    });
    expect(body).toContain("Antwortkoerper");
    expect(body).not.toContain("<style>");
    expect(body).toContain("x".repeat(300));
    expect(body).not.toContain("x".repeat(301));
  });

  it("laesst den Antwortkoerper weg, wenn keiner vorliegt", () => {
    const body = buildAlertIssueBody({ healthUrl: "https://x", classification: gateway, timestamp: "T" });
    expect(body).not.toContain("Antwortkoerper");
  });

  it("kommentiert Folgepruefungen je nach Ursache unterschiedlich", () => {
    const suspendedComment = buildAlertComment({ classification: suspended, timestamp: "T2" });
    expect(suspendedComment).toContain("HTTP `503`");
    expect(suspendedComment).toContain("Suspendierung beim Anbieter");
    const gatewayComment = buildAlertComment({ classification: gateway, timestamp: "T2" });
    expect(gatewayComment).toBe("⚠️ Immer noch nicht erreichbar (HTTP `503`, T2).");
  });

  it("formuliert Discord-Alarme ohne falsche Entwarnung", () => {
    expect(buildDiscordMessage({ classification: suspended, timestamp: "T" })).toContain("Render-Konto");
    expect(buildDiscordMessage({ classification: gateway, timestamp: "T" })).toContain("nicht erreichbar");
    expect(buildDiscordMessage({ classification: gateway, timestamp: "T" })).not.toContain("Render-Konto");
  });
});

describe("uptime-waechter workflow wiring", () => {
  const workflow = readFileSync(".github/workflows/uptime-waechter.yml", "utf8");

  it("nutzt die Klassifikation statt eines pauschalen Ausfalltextes", () => {
    expect(workflow).toContain("node scripts/uptime-alert-report.mjs");
    expect(workflow).toContain("uptime-alert-logic.mjs");
    expect(workflow).toContain("--body-file");
    expect(workflow).toContain("--label uptime-alert");
    expect(workflow).not.toContain("reagiert Render evtl. gerade neu");
  });

  it("behaelt Alarmierung, Dedupe und automatische Entwarnung bei", () => {
    expect(workflow).toContain('cron: "*/30 * * * *"');
    expect(workflow).toContain("gh issue list --repo \"$REPO\" --label uptime-alert --state open");
    expect(workflow).toContain("gh issue close");
    expect(workflow).toContain("DISCORD_WEBHOOK_URL");
  });

  it("faellt bei fehlgeschlagener Klassifikation auf einen neutralen Text zurueck", () => {
    expect(workflow).toContain("continue-on-error: true");
    expect(workflow).toContain('if [ ! -s "$ALERT_DIR-body.md" ]');
  });
});

describe("render-resume workflow", () => {
  const workflow = readFileSync(".github/workflows/render-resume.yml", "utf8");

  it("unterscheidet Nutzer- von Plattform-Suspendierung", () => {
    expect(workflow).toContain("only services suspended by a user");
    expect(workflow).toContain("::warning::");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(workflow).toContain("/services/{sid}/resume");
  });

  it("bleibt ein reiner Resume-Workflow ohne Deploy oder Env-Aenderung", () => {
    expect(workflow).not.toContain("render-deploy.mjs");
    expect(workflow).not.toContain("env-vars");
  });
});
