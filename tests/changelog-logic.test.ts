import { describe, expect, it } from "vitest";
import { buildChangelog, parseCommitSubject, redactSensitive, renderChangelog } from "../lib/changelog-logic";

describe("changelog logic", () => {
  it("parses conventional commit subjects with and without scope", () => {
    const withScope = parseCommitSubject("feat(sync): add conflict analysis");
    expect(withScope.type).toBe("feat");
    expect(withScope.scope).toBe("sync");
    expect(withScope.subject).toBe("add conflict analysis");

    const withoutScope = parseCommitSubject("fix: resolve crash");
    expect(withoutScope.type).toBe("fix");
    expect(withoutScope.scope).toBeNull();
  });

  it("classifies non-conventional subjects as other", () => {
    expect(parseCommitSubject("Update stuff").type).toBe("other");
    expect(parseCommitSubject("").type).toBe("other");
  });

  it("groups entries by type and sorts them stably within sections", () => {
    const changelog = buildChangelog("1.1.0", [
      "feat(a): add first",
      "fix(b): patch second",
      "feat(c): add third",
    ]);
    expect(changelog.sections.map((section) => section.type)).toEqual(["feat", "fix"]);
    const feat = changelog.sections[0];
    expect(feat.entries).toEqual(["[a] add first", "[c] add third"]);
  });

  it("counts unclassified entries without listing them", () => {
    const changelog = buildChangelog("1.1.0", ["feat: ok", "loose message"]);
    expect(changelog.entryCount).toBe(2);
    expect(changelog.unclassifiedCount).toBe(1);
    const rendered = renderChangelog(changelog);
    expect(rendered).not.toContain("loose message");
    expect(rendered).toContain("1 Eintrag");
  });

  it("redacts sensitive values and URLs from subjects", () => {
    expect(redactSensitive("add token abc123 support")).not.toContain("abc123");
    expect(redactSensitive("see https://secret.example.com/x")).not.toContain("secret.example.com");
  });

  it("keeps sensitive values out of the rendered changelog", () => {
    const rendered = renderChangelog(buildChangelog("2.0.0", ["feat(auth): rotate api_key sk-live-999"]));
    expect(rendered).not.toContain("sk-live-999");
    expect(rendered).toContain("[auth]");
  });

  it("rejects invalid versions and inputs", () => {
    expect(() => buildChangelog("v1", ["x"])).toThrow();
    expect(() => buildChangelog("1.0", ["x"])).toThrow();
  });

  it("renders a stable markdown document", () => {
    const rendered = renderChangelog(buildChangelog("1.2.3", ["feat: one", "fix: two"]));
    expect(rendered).toContain("# Changelog 1.2.3");
    expect(rendered).toContain("## Neu");
    expect(rendered).toContain("- one");
  });
});
