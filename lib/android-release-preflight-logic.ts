/**
 * Android Release Gate — pure, side-effect-free validation.
 * Signing secrets must NEVER be logged or included in errors.
 */
export const CYBERSARAH_ANDROID_PACKAGE = "com.cybersarah.controlcenter";
export const REQUIRED_ANDROID_SIGNING_ENV = [
  "ANDROID_KEYSTORE_BASE64",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
] as const;

export type AndroidReleaseSources = {
  capacitorConfig: string;
  androidGradle: string;
  expoConfig: string;
  manifest: string;
};

export function androidVersionCode(version: string): number | null {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!parts) return null;
  const [major, minor, patch] = parts.slice(1).map(Number);
  if (parts.slice(1).some((x) => x.length > 1 && x.startsWith("0"))) return null;
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)
      || minor > 99 || patch > 99) return null;
  const result = major * 10_000 + minor * 100 + patch;
  return Number.isSafeInteger(result) && result > 0 && result <= 2_100_000_000 ? result : null;
}

/** Report only category names and never raw inputs (which may contain credentials). */
export function validateAndroidReleaseSources(
  source: AndroidReleaseSources,
  requestedVersion: string,
): string[] {
  const issues: string[] = [];
  if (!source.capacitorConfig.includes(`appId: "${CYBERSARAH_ANDROID_PACKAGE}"`))
    issues.push("Capacitor package ID mismatch");
  if (!new RegExp('applicationId\\s+["\\\']' + CYBERSARAH_ANDROID_PACKAGE.replace(/\./g, '\\.') + '["\\\']').test(source.androidGradle))
    issues.push("Gradle package ID mismatch");
  if (!source.expoConfig.includes(`const rawBundleId = "${CYBERSARAH_ANDROID_PACKAGE}"`))
    issues.push("Expo package ID mismatch");
  if (!source.manifest.includes('android.permission.INTERNET'))
    issues.push("Android INTERNET permission missing");
  if (!source.manifest.includes('android:exported="true"'))
    issues.push("Android launcher export missing");

  const expectedCode = androidVersionCode(requestedVersion);
  if (expectedCode === null) issues.push("Invalid Android release version");
  const versionName = source.androidGradle.match(/\bversionName\s+["']([^"']+)["']/)?.[1];
  const versionCodeText = source.androidGradle.match(/\bversionCode\s+(\d+)/)?.[1];
  const expoVersion = source.expoConfig.match(/\n\s*version:\s*"([^"]+)"/)?.[1];
  if (versionName !== requestedVersion || expoVersion !== requestedVersion)
    issues.push("Android/Expo versionName mismatch");
  if (expectedCode === null || versionCodeText === undefined || Number(versionCodeText) !== expectedCode)
    issues.push("Android versionCode mismatch");
  return issues;
}

export function missingAndroidSigningSecrets(env: Record<string, string | undefined>): string[] {
  return REQUIRED_ANDROID_SIGNING_ENV.filter((name) => !(env[name]?.trim()));
}
