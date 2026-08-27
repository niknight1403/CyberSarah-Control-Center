export type ReleasePreflightInput = {
  appName?: unknown;
  version?: unknown;
  androidPackage?: unknown;
  orientation?: unknown;
  buildCommand?: unknown;
};

export type ReleasePreflightIssue = {
  code:
    | "missing-app-name"
    | "invalid-version"
    | "invalid-android-package"
    | "invalid-orientation"
    | "missing-build-command";
  message: string;
};

export type ReleasePreflightResult = {
  ok: boolean;
  issues: ReleasePreflightIssue[];
  normalized: {
    appName: string;
    version: string;
    androidPackage: string;
    orientation: string;
    buildCommand: string;
  };
};

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const ANDROID_PACKAGE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

export function validateReleasePreflight(
  input: ReleasePreflightInput,
): ReleasePreflightResult {
  const appName = typeof input.appName === "string" ? input.appName.trim() : "";
  const version = typeof input.version === "string" ? input.version.trim() : "";
  const androidPackage =
    typeof input.androidPackage === "string" ? input.androidPackage.trim() : "";
  const orientation =
    typeof input.orientation === "string" ? input.orientation.trim() : "";
  const buildCommand =
    typeof input.buildCommand === "string" ? input.buildCommand.trim() : "";
  const issues: ReleasePreflightIssue[] = [];

  if (!appName) {
    issues.push({ code: "missing-app-name", message: "App name is required." });
  }
  if (!VERSION_PATTERN.test(version)) {
    issues.push({
      code: "invalid-version",
      message: "Version must use semantic MAJOR.MINOR.PATCH format.",
    });
  }
  if (!ANDROID_PACKAGE_PATTERN.test(androidPackage)) {
    issues.push({
      code: "invalid-android-package",
      message: "Android package must use lowercase dot-separated identifiers.",
    });
  }
  if (orientation !== "portrait") {
    issues.push({
      code: "invalid-orientation",
      message: "Release builds must use portrait orientation.",
    });
  }
  if (!buildCommand) {
    issues.push({
      code: "missing-build-command",
      message: "A production build command is required.",
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    normalized: { appName, version, androidPackage, orientation, buildCommand },
  };
}
