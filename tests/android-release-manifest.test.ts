import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertAabSignatureVerified,
  buildAndroidReleaseManifest,
  parseApkCertificateFingerprint,
} from "../scripts/android-release-manifest";

const cert = "ab".repeat(32);
const signatureOutput = `Verifies\nSigner #1 certificate SHA-256 digest: ${cert}\n`;
let folder: string;
let debugApk: string;
let adminApk: string;
let releaseAab: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "cybersarah-apk-evidence-"));
  debugApk = join(folder, "dev.apk");
  adminApk = join(folder, "admin.apk");
  releaseAab = join(folder, "bundle.aab");
  await Promise.all([
    writeFile(debugApk, "test-development-apk"),
    writeFile(adminApk, "test-admin-apk"),
    writeFile(releaseAab, "test-release-aab"),
  ]);
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function build(overrides: Record<string, unknown> = {}) {
  return buildAndroidReleaseManifest({
    version: "2.7.4",
    repository: "niknight1403/CyberSarah-Control-Center",
    commitSha: "0123456789abcdef0123456789abcdef01234567",
    workflowRunId: "41144742095",
    debugApk,
    adminApk,
    releaseAab,
    verifyApk: vi.fn(() => signatureOutput),
    verifyAab: vi.fn(() => "jar verified."),
    ...overrides,
  });
}

describe("Sprint 89 – Android release evidence", () => {
  it("creates hashes, source revision and signing fingerprints for all three release assets", async () => {
    const manifest = await build();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.source.commitSha).toHaveLength(40);
    expect(manifest.source.workflowRunId).toBe("41144742095");
    expect(manifest.applicationId).toBe("com.cybersarah.controlcenter");
    expect(manifest.artifacts).toHaveLength(3);
    expect(manifest.artifacts.map(a => a.kind)).toEqual([
      "development-apk", "admin-apk", "release-aab",
    ]);
    expect(manifest.artifacts.every(a => /^[a-f0-9]{64}$/.test(a.sha256))).toBe(true);
    expect(manifest.artifacts.every(a => a.sizeBytes > 0)).toBe(true);
    expect(manifest.artifacts[0].certificateSha256).toBe(cert);
    expect(manifest.artifacts[1].certificateSha256).toBe(cert);
    expect(manifest.artifacts[2].certificateSha256).toBeUndefined();
  });

  it("rejects missing or empty APK files", async () => {
    await rm(adminApk);
    await expect(build()).rejects.toThrow();
    await writeFile(adminApk, "");
    await expect(build()).rejects.toThrow(/nonempty/);
  });

  it("rejects absent, malformed or ambiguous signing evidence", async () => {
    expect(() => parseApkCertificateFingerprint("Verifies\n")).toThrow();
    expect(() => parseApkCertificateFingerprint("Signer #1 certificate SHA-256 digest: invalid")).toThrow();
    expect(() => parseApkCertificateFingerprint(signatureOutput + signatureOutput)).toThrow(/ambiguous/);
    await expect(build({ verifyApk: () => "" })).rejects.toThrow(/fingerprint/);
    await expect(build({ verifyApk: () => { throw new Error("bad APK signature"); } })).rejects.toThrow(/bad APK/);
  });

  it("rejects unsigned or unverified AAB bundles", async () => {
    expect(() => assertAabSignatureVerified("jar is unsigned")).toThrow();
    await expect(build({ verifyAab: () => "jar is unsigned" })).rejects.toThrow();
    await expect(build({ verifyAab: () => { throw new Error("jarsigner failed"); } })).rejects.toThrow();
  });

  it("requires a trustworthy commit, run ID and distinct versioned artifacts", async () => {
    await expect(build({ commitSha: "main" })).rejects.toThrow(/commit SHA/);
    await expect(build({ workflowRunId: "0" })).rejects.toThrow(/run ID/);
    await expect(build({ version: "../invalid" })).rejects.toThrow(/version/);
    await expect(build({ adminApk: debugApk })).rejects.toThrow(/distinct/);
  });
});
