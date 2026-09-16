import { describe, expect, it } from "vitest";

import {
  compareVersions,
  nextReleaseVersion,
  parseReleaseTag,
} from "@/lib/release-version-logic";

describe("parseReleaseTag", () => {
  it("erkennt gueltige v<semver>-apk-Tags", () => {
    expect(parseReleaseTag("v2.1.7-apk")).toEqual({ major: 2, minor: 1, patch: 7 });
    expect(parseReleaseTag("v10.20.30-apk")).toEqual({ major: 10, minor: 20, patch: 30 });
  });

  it("lehnt andere Formate ab", () => {
    expect(parseReleaseTag("v2.1.7")).toBeNull();
    expect(parseReleaseTag("v2.1.7-debug-apk")).toBeNull();
    expect(parseReleaseTag("2.1.7-apk")).toBeNull();
    expect(parseReleaseTag("vX.Y.Z-apk")).toBeNull();
    expect(parseReleaseTag("")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("sortiert korrekt nach major, minor, patch", () => {
    const v217 = { major: 2, minor: 1, patch: 7 };
    expect(compareVersions({ major: 2, minor: 1, patch: 8 }, v217)).toBeGreaterThan(0);
    expect(compareVersions({ major: 2, minor: 2, patch: 0 }, v217)).toBeGreaterThan(0);
    expect(compareVersions({ major: 3, minor: 0, patch: 0 }, v217)).toBeGreaterThan(0);
    expect(compareVersions(v217, v217)).toBe(0);
  });
});

describe("nextReleaseVersion", () => {
  it("Der Stolperstein-Fall: kein Input → naechste Patch-Version statt hartcodiertem 2.0.0", () => {
    const tags = ["v2.1.5-apk", "v2.1.7-apk", "v2.1.6-apk", "v2.0.0-apk"];
    expect(nextReleaseVersion(tags, undefined)).toBe("2.1.8");
  });

  it("akzeptiert einen gueltigen expliziten Wunsch unverändert", () => {
    expect(nextReleaseVersion(["v2.1.7-apk"], "3.0.0")).toBe("3.0.0");
    expect(nextReleaseVersion([], "2.1.8")).toBe("2.1.8");
  });

  it("lehnt kaputte Inputs ab und faellt auf Auto-Ableitung zurueck", () => {
    expect(nextReleaseVersion(["v2.1.7-apk"], "v2.1.8")).toBe("2.1.8"); // 'v'-Praefext ist ungueltig → Auto-Ableitung
    expect(nextReleaseVersion(["v2.1.7-apk"], "abc")).toBe("2.1.8");
    expect(nextReleaseVersion(["v2.1.7-apk"], "")).toBe("2.1.8");
    expect(nextReleaseVersion(["v2.1.7-apk"], "2.1")).toBe("2.1.8");
  });

  it("ohne gueltige Tags gibt es den Fallback", () => {
    expect(nextReleaseVersion([], undefined)).toBe("2.0.0");
    expect(nextReleaseVersion(["andere-tags", "v2.1.7"], undefined)).toBe("2.0.0");
  });
});
