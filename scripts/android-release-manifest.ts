/**
 * Sprint 89 — machine-readable Android release evidence.
 * This deliberately does not sign anything or access a private key. It refuses
 * to publish an evidence manifest unless both APK signatures and the AAB
 * verification have succeeded against the actual build artifacts.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

export type ArtifactKind = "development-apk" | "admin-apk" | "release-aab";

export interface AndroidReleaseArtifact {
  kind: ArtifactKind;
  file: string;
  sizeBytes: number;
  sha256: string;
  certificateSha256?: string;
}

export interface AndroidReleaseManifest {
  schemaVersion: 1;
  version: string;
  applicationId: "com.cybersarah.controlcenter";
  source: {
    repository: string;
    commitSha: string;
    workflowRunId: string;
  };
  verification: {
    apkSignatures: "apksigner";
    aabSignature: "jarsigner";
    evidence: "verified-at-build";
  };
  artifacts: AndroidReleaseArtifact[];
}

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/;
const SHA_RE = /^[a-f0-9]{40}$/i;
const FINGERPRINT_RE = /Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9:]+)/g;

export function parseApkCertificateFingerprint(output: string): string {
  const fingerprints = Array.from(output.matchAll(FINGERPRINT_RE), match =>
    match[1].replace(/:/g, "").toLowerCase(),
  );
  if (fingerprints.length !== 1 || !/^[a-f0-9]{64}$/.test(fingerprints[0])) {
    throw new Error("APK certificate fingerprint missing, malformed or ambiguous");
  }
  return fingerprints[0];
}

export function assertAabSignatureVerified(output: string): void {
  if (!/\bjar verified\./i.test(output) || /\bjar is unsigned\b/i.test(output)) {
    throw new Error("AAB signature could not be verified by jarsigner");
  }
}

async function inspectArtifact(kind: ArtifactKind, path: string): Promise<AndroidReleaseArtifact> {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size === 0) {
    throw new Error(`Release artifact is not a nonempty file: ${path}`);
  }
  const bytes = await readFile(path);
  return {
    kind,
    file: basename(path),
    sizeBytes: metadata.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function buildAndroidReleaseManifest(input: {
  version: string;
  repository: string;
  commitSha: string;
  workflowRunId: string;
  debugApk: string;
  adminApk: string;
  releaseAab: string;
  verifyApk: (apk: string) => string | Promise<string>;
  verifyAab: (aab: string) => string | Promise<string>;
}): Promise<AndroidReleaseManifest> {
  if (!VERSION_RE.test(input.version)) throw new Error("Invalid release version");
  if (!SHA_RE.test(input.commitSha)) throw new Error("A full 40-char source commit SHA is required");
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(input.repository))
    throw new Error("Invalid GitHub repository");
  if (!/^[1-9]\d*$/.test(input.workflowRunId)) throw new Error("A real workflow run ID is required");

  const paths = [input.debugApk, input.adminApk, input.releaseAab];
  if (new Set(paths.map(path => resolve(path))).size !== 3)
    throw new Error("Release artifacts must be three distinct files");
  const artifacts = await Promise.all([
    inspectArtifact("development-apk", input.debugApk),
    inspectArtifact("admin-apk", input.adminApk),
    inspectArtifact("release-aab", input.releaseAab),
  ]);

  // Fail closed if a verification command throws, or the attestation output is
  // unexpected. Captured SHA-256 fingerprints are public certificate digests,
  // NOT private keys or signing secrets.
  artifacts[0].certificateSha256 = parseApkCertificateFingerprint(await input.verifyApk(input.debugApk));
  artifacts[1].certificateSha256 = parseApkCertificateFingerprint(await input.verifyApk(input.adminApk));
  assertAabSignatureVerified(await input.verifyAab(input.releaseAab));

  return {
    schemaVersion: 1,
    version: input.version,
    applicationId: "com.cybersarah.controlcenter",
    source: {
      repository: input.repository,
      commitSha: input.commitSha.toLowerCase(),
      workflowRunId: input.workflowRunId,
    },
    verification: {
      apkSignatures: "apksigner",
      aabSignature: "jarsigner",
      evidence: "verified-at-build",
    },
    artifacts,
  };
}

async function main() {
  const version = process.argv[2];
  if (!version) throw new Error("Usage: tsx scripts/android-release-manifest.ts <version>");
  const sdk = process.env.ANDROID_SDK_ROOT;
  const apksigner = process.env.APKSIGNER;
  if (!sdk || !apksigner) throw new Error("Android SDK and APKSIGNER must be configured");

  const prefix = `CyberSarah-ControlCenter-v${version}`;
  const manifest = await buildAndroidReleaseManifest({
    version,
    repository: process.env.GITHUB_REPOSITORY ?? "",
    commitSha: process.env.GITHUB_SHA ?? "",
    workflowRunId: process.env.GITHUB_RUN_ID ?? "",
    debugApk: `${prefix}-dev.apk`,
    adminApk: `${prefix}-admin.apk`,
    releaseAab: `${prefix}-release.aab`,
    verifyApk: apk => execFileSync(apksigner, ["verify", "--verbose", "--print-certs", apk], { encoding: "utf8" }),
    verifyAab: aab => execFileSync("jarsigner", ["-verify", aab], { encoding: "utf8" }),
  });
  const output = `${prefix}-manifest.json`;
  await writeFile(output, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  console.log(`Verified Android release manifest: ${output}`);
}

// Works under tsx in both CommonJS (package.json has no "type") and ESM.
if (process.argv[1] && /(?:^|[\\/])android-release-manifest\.(?:ts|js)$/.test(process.argv[1])) {
  main().catch(error => {
    console.error(`Android release evidence FAILED: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
