export type AndroidReleaseInput = {
  packageName?: unknown;
  version?: unknown;
  orientation?: unknown;
  hasLauncherIcon?: unknown;
  hasSplashIcon?: unknown;
};

export type AndroidReleaseResult = {
  ready: boolean;
  issues: string[];
};

export function evaluateAndroidRelease(input: AndroidReleaseInput): AndroidReleaseResult {
  const issues: string[] = [];
  if (typeof input.packageName !== "string" || !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(input.packageName)) issues.push("android-package");
  if (typeof input.version !== "string" || !/^\d+\.\d+\.\d+$/.test(input.version)) issues.push("version");
  if (input.orientation !== "portrait") issues.push("orientation");
  if (input.hasLauncherIcon !== true) issues.push("launcher-icon");
  if (input.hasSplashIcon !== true) issues.push("splash-icon");
  return { ready: issues.length === 0, issues };
}
