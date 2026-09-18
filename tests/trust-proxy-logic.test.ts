import { describe, expect, it } from "vitest";

import { isTruthyEnvFlag } from "../lib/trust-proxy-logic";

/**
 * Sprint 152 — Root-Cause-Regressionstest.
 *
 * Vorher: server/_core/index.ts pruefte `process.env.TRUST_PROXY === "true"`,
 * aber render.yaml setzt TRUST_PROXY="1". Das exakte String-"===" liess
 * "trust proxy" in Produktion IMMER deaktiviert -> req.ip zeigte fuer ALLE
 * Nutzer auf Render's interne Proxy-Adresse -> der IP-basierte Rate-Limiter
 * fasste ALLE Nutzer in einen gemeinsamen Zaehler-Bucket zusammen. Ein
 * einzelner Nutzer (z. B. intensives Monitoring) konnte so das Rate-Limit
 * fuer alle anderen Nutzer gleichzeitig ausschoepfen — sichtbar im Client
 * als "Unable to transform response from server" (die resultierende
 * 429-JSON-Antwort passt nicht ins tRPC-Response-Envelope).
 */
describe("isTruthyEnvFlag", () => {
  it("erkennt render.yaml-Schreibweise \"1\" als wahr (Kernfall des Bugs)", () => {
    expect(isTruthyEnvFlag("1")).toBe(true);
  });

  it("erkennt weitere gaengige Wahrheitswert-Schreibweisen", () => {
    expect(isTruthyEnvFlag("true")).toBe(true);
    expect(isTruthyEnvFlag("TRUE")).toBe(true);
    expect(isTruthyEnvFlag(" yes ")).toBe(true);
    expect(isTruthyEnvFlag("on")).toBe(true);
  });

  it("liefert false fuer nicht gesetzte oder falsche Werte", () => {
    expect(isTruthyEnvFlag(undefined)).toBe(false);
    expect(isTruthyEnvFlag(null)).toBe(false);
    expect(isTruthyEnvFlag("")).toBe(false);
    expect(isTruthyEnvFlag("0")).toBe(false);
    expect(isTruthyEnvFlag("false")).toBe(false);
    expect(isTruthyEnvFlag("nope")).toBe(false);
  });
});
