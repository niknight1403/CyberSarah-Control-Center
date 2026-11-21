export function matchesDeclaredUploadMetadata(
  declared: { contentType: string; size: number },
  actual: { contentType: string; size: number },
): boolean {
  return declared.contentType === actual.contentType &&
    Number.isSafeInteger(declared.size) &&
    Number.isSafeInteger(actual.size) &&
    declared.size > 0 &&
    actual.size > 0 &&
    declared.size === actual.size;
}
