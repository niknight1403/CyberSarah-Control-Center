/**
 * Sprint 298 — Tests fuer Fehlerbildschirme (sprechende Fallbacks).
 */
import { describe, it, expect } from "vitest";
import {
  type AppVariant,
  type ErrorClass,
  classifyErrorClass,
  createFallbackError,
  needsFallback,
  sanitizeErrorForLog,
} from "@/lib/error-fallback-logic";

describe("Sprint 298 — Error Fallback Logic", () => {
  describe("classifyErrorClass", () => {
    it("classifies network errors from string", () => {
      expect(classifyErrorClass("network error")).toBe("network");
      expect(classifyErrorClass("fetch failed")).toBe("network");
      expect(classifyErrorClass("Connection timeout")).toBe("network");
      expect(classifyErrorClass("ECONNREFUSED")).toBe("network");
    });
    it("classifies auth errors from string", () => {
      expect(classifyErrorClass("Unauthorized access")).toBe("auth");
      expect(classifyErrorClass("401 error")).toBe("auth");
      expect(classifyErrorClass("403 forbidden")).toBe("auth");
    });
    it("classifies render errors from string", () => {
      expect(classifyErrorClass("null is not an object")).toBe("render");
      expect(classifyErrorClass("undefined is not a function")).toBe("render");
      expect(classifyErrorClass("Cannot read property 'x'")).toBe("render");
    });
    it("classifies Error objects", () => {
      expect(classifyErrorClass(new Error("network timeout"))).toBe("network");
      expect(classifyErrorClass(new Error("Unauthorized"))).toBe("auth");
      expect(classifyErrorClass(new Error("Cannot read property foo"))).toBe("render");
    });
    it("classifies unknown for empty/garbage", () => {
      expect(classifyErrorClass(null)).toBe("unknown");
      expect(classifyErrorClass(undefined)).toBe("unknown");
      expect(classifyErrorClass("")).toBe("unknown");
      expect(classifyErrorClass(42)).toBe("unknown");
    });
    it("classifies object with stack as render", () => {
      const errWithStack = { stack: "at line 42", message: "boom" };
      expect(classifyErrorClass(errWithStack)).toBe("render");
    });
  });

  describe("createFallbackError", () => {
    it("hides diagnostics in release variant", () => {
      const fb = createFallbackError(new Error("network timeout"), "release");
      expect(fb.showDiagnostics).toBe(false);
      expect(fb.canRetry).toBe(true);
      expect(fb.canGoHome).toBe(true);
      expect(fb.title).toBe("Verbindungsproblem");
    });
    it("hides diagnostics in admin variant", () => {
      const fb = createFallbackError(new Error("null reference"), "admin");
      expect(fb.showDiagnostics).toBe(false);
      expect(fb.title).toBe("Ansicht konnte nicht geladen werden");
    });
    it("shows diagnostics in dev variant", () => {
      const fb = createFallbackError(new Error("timeout"), "dev");
      expect(fb.showDiagnostics).toBe(true);
    });
    it("auth error does not allow retry", () => {
      const fb = createFallbackError("Unauthorized access", "release");
      expect(fb.errorClass).toBe("auth");
      expect(fb.canRetry).toBe(false);
      expect(fb.canGoHome).toBe(true);
    });
    it("unknown error has generic title", () => {
      const fb = createFallbackError(null, "release");
      expect(fb.title).toBe("Etwas ist schiefgelaufen");
      expect(fb.errorClass).toBe("unknown");
    });
    it("network error has specific title in release", () => {
      const fb = createFallbackError("fetch failed", "release");
      expect(fb.title).toBe("Verbindungsproblem");
      expect(fb.text).toContain("Verbindung");
    });
    it("does not leak stack traces in release text", () => {
      const err = new Error("Cannot read property 'foo' of undefined\n  at Object.<anonymous> (/secret/path/file.ts:42:1)");
      const fb = createFallbackError(err, "release");
      expect(fb.text).not.toContain("/secret/path");
      expect(fb.text).not.toContain("file.ts");
      expect(fb.text).not.toContain("42:1");
    });
  });

  describe("needsFallback", () => {
    it("returns true for render errors", () => {
      expect(needsFallback("render")).toBe(true);
    });
    it("returns true for network errors", () => {
      expect(needsFallback("network")).toBe(true);
    });
    it("returns false for auth errors (handled by login redirect)", () => {
      expect(needsFallback("auth")).toBe(false);
    });
    it("returns true for unknown errors", () => {
      expect(needsFallback("unknown")).toBe(true);
    });
  });

  describe("sanitizeErrorForLog", () => {
    it("returns string for string error", () => {
      expect(sanitizeErrorForLog("some error")).toBe("some error");
    });
    it("returns name:message for Error objects", () => {
      const e = new Error("test message");
      expect(sanitizeErrorForLog(e)).toBe("Error: test message");
    });
    it("truncates very long messages", () => {
      const long = "x".repeat(600);
      expect(sanitizeErrorForLog(long).length).toBeLessThanOrEqual(500);
    });
    it("handles null/undefined", () => {
      expect(sanitizeErrorForLog(null)).toBe("unknown error");
      expect(sanitizeErrorForLog(undefined)).toBe("unknown error");
    });
  });
});
