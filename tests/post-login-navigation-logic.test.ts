import { describe, it, expect } from "vitest";
import {
  buildPackageLoginPath,
  resolvePostLoginPath,
  resolveRequestedPackage,
} from "../lib/post-login-navigation-logic";

describe("resolvePostLoginPath", () => {
  it("bleibt ohne Ziel auf dem Start", () => {
    expect(resolvePostLoginPath()).toBe("/");
    expect(resolvePostLoginPath("")).toBe("/");
    expect(resolvePostLoginPath("   ")).toBe("/");
    expect(resolvePostLoginPath(null)).toBe("/");
  });

  it("nimmt interne Pfade mit Query an", () => {
    expect(resolvePostLoginPath("/ai-influenza-team?package=growth")).toBe("/ai-influenza-team?package=growth");
    expect(resolvePostLoginPath("  /settings  ")).toBe("/settings");
  });

  it("weist absolute und protokoll-relative Ziele ab", () => {
    expect(resolvePostLoginPath("https://evil.example/pay")).toBe("/");
    expect(resolvePostLoginPath("//evil.example/pay")).toBe("/");
    expect(resolvePostLoginPath("/\\evil.example")).toBe("/");
    expect(resolvePostLoginPath("javascript:alert(1)")).toBe("/");
  });

  it("weist Ziele ohne fuehrenden Schraegstrich und Steuerzeichen ab", () => {
    expect(resolvePostLoginPath("ai-influenza-team")).toBe("/");
    expect(resolvePostLoginPath("/ai\ninfluenza")).toBe("/");
    expect(resolvePostLoginPath(`/${"a".repeat(600)}`)).toBe("/");
  });
});

describe("buildPackageLoginPath", () => {
  it("baut Login mit Rueckweg auf das Paket", () => {
    expect(buildPackageLoginPath("growth")).toBe("/login?next=%2Fai-influenza-team%3Fpackage%3Dgrowth");
  });

  it("laesst nur einfache Paketnamen durch", () => {
    expect(buildPackageLoginPath("Growth")).toBe("/login?next=%2Fai-influenza-team%3Fpackage%3Dgrowth");
    expect(buildPackageLoginPath("../../admin")).toBe("/login");
    expect(buildPackageLoginPath("a b")).toBe("/login");
    expect(buildPackageLoginPath("")).toBe("/login");
  });
});

describe("resolveRequestedPackage", () => {
  const allowed = ["starter", "growth", "business"] as const;

  it("nimmt bekannte Pakete an", () => {
    expect(resolveRequestedPackage("growth", allowed)).toBe("growth");
    expect(resolveRequestedPackage("  BUSINESS ", allowed)).toBe("business");
    expect(resolveRequestedPackage(["starter", "growth"], allowed)).toBe("starter");
  });

  it("ignoriert unbekannte oder fehlende Werte", () => {
    expect(resolveRequestedPackage("platinum", allowed)).toBeNull();
    expect(resolveRequestedPackage(undefined, allowed)).toBeNull();
    expect(resolveRequestedPackage("", allowed)).toBeNull();
  });
});
