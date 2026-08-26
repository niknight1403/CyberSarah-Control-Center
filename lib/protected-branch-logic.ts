const protectedBranchPatterns = [
  /^(main|master|develop|development)$/i,
  /^release(?:[\/-].*)?$/i,
  /^hotfix(?:[\/-].*)?$/i,
];

export function isProtectedBranch(branch: string) {
  return protectedBranchPatterns.some((pattern) => pattern.test(branch.trim()));
}

export function getProtectedBranchWarning(branch: string) {
  return `„${branch}“ ist ein geschützter Zielbranch. Ein Push kann den gemeinsamen Integrationsstand unmittelbar verändern.`;
}
