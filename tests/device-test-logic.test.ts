import { describe, expect, it } from "vitest";
import {
  buildDeviceTestReport,
  evaluateDeviceTest,
  isProductiveEndpoint,
  summarizeDeviceTestReport,
  type DeviceTestInput,
} from "../lib/device-test-logic";

describe("device-test-logic", () => {
  it("bewertet den Gesamtzustand prioritaetsbasiert: fail > untested > pass", () => {
    expect(evaluateDeviceTest(["pass", "pass"])).toBe("pass");
    expect(evaluateDeviceTest(["pass", "untested"])).toBe("pass");
    expect(evaluateDeviceTest(["pass", "fail"])).toBe("fail");
    expect(evaluateDeviceTest(["untested", "untested"])).toBe("untested");
    expect(evaluateDeviceTest([])).toBe("untested");
  });

  it("erkennt produktive Endpoints und lehnt Loopback-Adressen ab", () => {
    expect(isProductiveEndpoint("https://app.cybersarah-ki.com")).toBe(true);
    expect(isProductiveEndpoint("http://127.0.0.1:3000")).toBe(false);
    expect(isProductiveEndpoint("https://localhost/api")).toBe(false);
    expect(isProductiveEndpoint("http://[::1]:8080")).toBe(false);
    expect(isProductiveEndpoint("")).toBe(false);
    expect(isProductiveEndpoint("app.cybersarah-ki.com")).toBe(false);
  });

  it("liefert fuer jeden Pruefpunkt eine handlungsfaehige Meldung", () => {
    const report = buildDeviceTestReport([
      { kind: "endpoint", state: "fail" },
      { kind: "workspace", state: "pass" },
      { kind: "offline", state: "untested" },
    ]);
    const endpoint = report.checks.find((c) => c.kind === "endpoint");
    expect(endpoint?.message).toContain("APP_BASE_URL");
    expect(endpoint?.message).toContain("127.0.0.1");
    const offline = report.checks.find((c) => c.kind === "offline");
    expect(offline?.message).toContain("GERAETETEST_v2.0.md");
    expect(report.overall).toBe("fail");
    expect(report.blockers).toHaveLength(1);
    expect(report.blockers[0].kind).toBe("endpoint");
  });

  it("fasst einen vollstaendig bestandenen Test als PASS zusammen", () => {
    const inputs: DeviceTestInput[] = [
      { kind: "install", state: "pass" },
      { kind: "endpoint", state: "pass" },
      { kind: "secureStore", state: "pass" },
      { kind: "workspace", state: "pass" },
      { kind: "provider", state: "pass" },
      { kind: "push", state: "pass" },
      { kind: "camera", state: "pass" },
      { kind: "microphone", state: "pass" },
      { kind: "offline", state: "pass" },
      { kind: "rbac", state: "pass" },
    ];
    const report = buildDeviceTestReport(inputs);
    expect(report.overall).toBe("pass");
    expect(report.blockers).toHaveLength(0);
    expect(report.summary).toContain("10 Pruefpunkte gruen");
    expect(summarizeDeviceTestReport(report)).toMatch(/^PASS — /);
  });

  it("meldet ehrlich, wenn noch nichts geprueft wurde", () => {
    const report = buildDeviceTestReport([{ kind: "install", state: "untested" }]);
    expect(report.overall).toBe("untested");
    expect(report.summary).toContain("nicht begonnen");
    expect(summarizeDeviceTestReport(report)).toMatch(/^OFFEN — /);
  });

  it("schreibt Beobachtungen unkritisch mit", () => {
    const report = buildDeviceTestReport([
      { kind: "provider", state: "pass", note: "Failover Gemini -> OpenAI nach 429 beobachtet" },
    ]);
    expect(report.checks[0].note).toContain("Failover");
  });
});
