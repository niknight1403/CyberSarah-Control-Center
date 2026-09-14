import { describe, expect, it } from "vitest";

import { resolveAdminGithubToken } from "@/lib/admin-integrations-logic";

const VALID_PAT = "ghp_" + "a".repeat(36);
const VALID_FINE_GRAINED = "github_pat_" + "b".repeat(30);

describe("resolveAdminGithubToken", () => {
  it("liefert kein Token, wenn der Aufrufer kein Administrator ist", () => {
    const result = resolveAdminGithubToken({ ADMIN_GITHUB_TOKEN: VALID_PAT }, false);
    expect(result).toEqual({ available: false, reason: "not-admin" });
  });

  it("liefert kein Token, wenn kein Secret konfiguriert ist", () => {
    const result = resolveAdminGithubToken({}, true);
    expect(result).toEqual({ available: false, reason: "not-configured" });
  });

  it("lehnt ein unplausibel formatiertes Token ab", () => {
    const result = resolveAdminGithubToken({ ADMIN_GITHUB_TOKEN: "nicht-ein-token" }, true);
    expect(result).toEqual({ available: false, reason: "invalid-format" });
  });

  it("liefert ein gueltiges klassisches PAT fuer den Administrator", () => {
    const result = resolveAdminGithubToken({ ADMIN_GITHUB_TOKEN: VALID_PAT }, true);
    expect(result).toEqual({ available: true, token: VALID_PAT });
  });

  it("akzeptiert fine-grained Tokens (github_pat_...)", () => {
    const result = resolveAdminGithubToken({ ADMIN_GITHUB_TOKEN: VALID_FINE_GRAINED }, true);
    expect(result).toEqual({ available: true, token: VALID_FINE_GRAINED });
  });

  it("bevorzugt ADMIN_GITHUB_TOKEN vor dem generischen GITHUB_TOKEN-Fallback", () => {
    const other = "ghp_" + "c".repeat(36);
    const result = resolveAdminGithubToken({ ADMIN_GITHUB_TOKEN: VALID_PAT, GITHUB_TOKEN: other }, true);
    expect(result).toEqual({ available: true, token: VALID_PAT });
  });

  it("faellt auf GITHUB_TOKEN zurueck, wenn ADMIN_GITHUB_TOKEN fehlt", () => {
    const result = resolveAdminGithubToken({ GITHUB_TOKEN: VALID_PAT }, true);
    expect(result).toEqual({ available: true, token: VALID_PAT });
  });

  it("trimmt Whitespace um das Token", () => {
    const result = resolveAdminGithubToken({ ADMIN_GITHUB_TOKEN: `  ${VALID_PAT}  ` }, true);
    expect(result).toEqual({ available: true, token: VALID_PAT });
  });
});
