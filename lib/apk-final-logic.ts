/**
 * APK-Final & Web Export Smoke Logik (rein, testbar) — Sprint 380.
 *
 * Prüft APK-Größenbudgets, Signaturnachweise, Artefakt-Vollständigkeit,
 * Web-Export DOM/Nav/Health Smoke und hält ehrliche Owner-Handoffs fest.
 */

export interface ApkArtifactInput {
  name: string;
  sizeBytes: number;
  signed: boolean;
  type: "admin-apk" | "dev-apk" | "release-aab";
}

export interface WebExportSmokeInput {
  domMounted: boolean;
  loginScreenRendered: boolean;
  navigationRoutesCount: number;
  trpcGatesChecked: boolean;
  liveHealthOk: boolean;
}

export interface ApkFinalReportInput {
  artifacts: ApkArtifactInput[];
  webExport: WebExportSmokeInput;
  maxSizeBudgetMB?: number; // Standard: 25 MB
}

export interface ApkFinalCheck {
  name: string;
  passed: boolean;
  note: string;
}

export interface ApkFinalReport {
  passed: boolean;
  score: number;
  checks: ApkFinalCheck[];
  totalSizeMB: number;
  withinBudget: boolean;
  honestOwnerHandoffs: string[];
}

export const SERIE_G_MAX_APK_SIZE_MB = 25;

export function validateApkArtifact(
  artifact: ApkArtifactInput,
  maxSizeBudgetMB = SERIE_G_MAX_APK_SIZE_MB,
): { valid: boolean; sizeMB: number; notes: string[] } {
  const sizeMB = Number((artifact.sizeBytes / (1024 * 1024)).toFixed(2));
  const notes: string[] = [];
  let valid = true;

  if (!artifact.signed) {
    valid = false;
    notes.push(`Artifact ${artifact.name} is not signed.`);
  }

  if (sizeMB > maxSizeBudgetMB) {
    valid = false;
    notes.push(`Artifact ${artifact.name} (${sizeMB} MB) exceeds budget of ${maxSizeBudgetMB} MB.`);
  } else {
    notes.push(`Artifact ${artifact.name} (${sizeMB} MB) is within budget.`);
  }

  return { valid, sizeMB, notes };
}

export function evaluateApkFinalReport(input: ApkFinalReportInput): ApkFinalReport {
  const maxSizeBudgetMB = input.maxSizeBudgetMB ?? SERIE_G_MAX_APK_SIZE_MB;
  const checks: ApkFinalCheck[] = [];
  let totalSizeBytes = 0;
  let allArtifactsValid = true;

  // Artifact checks
  for (const artifact of input.artifacts) {
    totalSizeBytes += artifact.sizeBytes;
    const val = validateApkArtifact(artifact, maxSizeBudgetMB);
    if (!val.valid) allArtifactsValid = false;

    checks.push({
      name: `Artifact: ${artifact.name}`,
      passed: val.valid,
      note: val.notes.join("; "),
    });
  }

  const totalSizeMB = Number((totalSizeBytes / (1024 * 1024)).toFixed(2));
  const withinBudget = totalSizeMB <= maxSizeBudgetMB;

  checks.push({
    name: "Total APK/AAB Size Budget",
    passed: withinBudget,
    note: `Total size ${totalSizeMB} MB vs max budget ${maxSizeBudgetMB} MB`,
  });

  // Web Export checks
  const webExportPassed =
    input.webExport.domMounted &&
    input.webExport.loginScreenRendered &&
    input.webExport.navigationRoutesCount > 0 &&
    input.webExport.trpcGatesChecked &&
    input.webExport.liveHealthOk;

  checks.push({
    name: "Web Export & Live Navigation Smoke",
    passed: webExportPassed,
    note: `DOM:${input.webExport.domMounted}, Login:${input.webExport.loginScreenRendered}, Routes:${input.webExport.navigationRoutesCount}, Health:${input.webExport.liveHealthOk}`,
  });

  const passedCount = checks.filter((c) => c.passed).length;
  const totalCount = checks.length;
  const score = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

  const honestOwnerHandoffs = [
    "APK-Gerätetest auf physischem Android-Gerät (Installation, Touch/Gesten, Startzeit-Messung).",
    "Play-Store-Einreichung und App-Review über Google Play Console.",
  ];

  return {
    passed: score === 100 && allArtifactsValid,
    score,
    checks,
    totalSizeMB,
    withinBudget,
    honestOwnerHandoffs,
  };
}
