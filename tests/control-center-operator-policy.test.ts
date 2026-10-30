import { describe, expect, it } from "vitest";
import { controlCenterAutopilotEnabled, assertControlCenterAutopilotEnabled } from "../lib/control-center-operator-policy";
describe("Sprint 18 – operator controlled full autopilot stop", () => {
  it("allows existing behaviour unless explicitly disabled", () => {
    expect(controlCenterAutopilotEnabled()).toBe(true);
    expect(controlCenterAutopilotEnabled("on")).toBe(true);
  });
  it("blocks every mixed-case off flag without calling a provider", () => {
    expect(controlCenterAutopilotEnabled(" OFF ")).toBe(false);
    expect(() => assertControlCenterAutopilotEnabled({ CONTROL_CENTER_AUTOPILOT: "off" })).toThrow("pausiert");
  });
  it("does not claim to revoke existing publishing permissions", () => {
    expect(() => assertControlCenterAutopilotEnabled({ CONTROL_CENTER_AUTOPILOT: "ON" })).not.toThrow();
  });
});
