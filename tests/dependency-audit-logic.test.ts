import { describe, it, expect } from "vitest";
import {
  classifyBumpRisk,
  orderBumps,
  recordRegressionResult,
  mayRelease,
  summarizeAudit,
} from "@/lib/dependency-audit-logic";
import type { DependencyBump } from "@/lib/dependency-audit-logic";

const bump = (over: Partial<DependencyBump> = {}): DependencyBump => ({
  name: "pkg-a",
  fromVersion: "1.2.3",
  toVersion: "1.2.4",
  changelogReviewed: true,
  ...over,
});

describe("Sprint 330 — Dependency-Audit", () => {
  it("klassifiziert Patch/Minor/Major/Unsicher", () => {
    expect(classifyBumpRisk(bump())).toBe("patch");
    expect(classifyBumpRisk(bump({ toVersion: "1.3.0" }))).toBe("minor");
    expect(classifyBumpRisk(bump({ toVersion: "2.0.0" }))).toBe("major");
    expect(classifyBumpRisk(bump({ toVersion: "2.0.0", changelogReviewed: false }))).toBe("unsicher");
    expect(classifyBumpRisk(bump({ toVersion: "v2" }))).toBe("unsicher");
  });

  it("ordnet patch zuerst, unsicher zuletzt", () => {
    const ordered = orderBumps([
      bump({ name: "z", toVersion: "2.0.0" }),
      bump({ name: "a", toVersion: "1.3.0" }),
      bump({ name: "b" }),
    ]);
    expect(ordered.map((b) => b.name)).toEqual(["b", "a", "z"]);
  });

  it("Release nur mit grüner Regression und bekanntem Risiko", () => {
    const base = { name: "pkg-a", risk: "patch" as const, regressionPassed: null, released: false };
    expect(mayRelease(base)).toBe(false);
    expect(mayRelease(recordRegressionResult(base, true))).toBe(true);
    expect(mayRelease(recordRegressionResult(base, false))).toBe(false);
    expect(mayRelease({ ...base, risk: "unsicher", regressionPassed: true })).toBe(false);
  });

  it("Zusammenfassung nennt Blocker beim Namen", () => {
    const s = summarizeAudit([
      { name: "ok-pkg", risk: "patch", regressionPassed: true, released: false },
      { name: "offen", risk: "minor", regressionPassed: null, released: false },
      { name: "rot", risk: "minor", regressionPassed: false, released: false },
    ]);
    expect(s).toContain("1/3 Bumps freigegeben");
    expect(s).toContain("offen (minor): blockiert — Regression noch nicht gelaufen");
    expect(s).toContain("rot (minor): blockiert — Regression ROT");
  });
});
