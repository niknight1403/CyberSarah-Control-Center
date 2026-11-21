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

export type UploadTenantResolution =
  | { ok: true; tenantId: number | null }
  | { ok: false; reason: "invalid" | "forbidden" | "selection_required" };

export function resolveUploadTenantId(
  memberships: readonly number[],
  requestedTenant: string | undefined,
): UploadTenantResolution {
  if (requestedTenant !== undefined && requestedTenant !== "") {
    if (!/^[1-9][0-9]*$/.test(requestedTenant)) return { ok: false, reason: "invalid" };
    const tenantId = Number(requestedTenant);
    if (!Number.isSafeInteger(tenantId)) return { ok: false, reason: "invalid" };
    return memberships.includes(tenantId)
      ? { ok: true, tenantId }
      : { ok: false, reason: "forbidden" };
  }
  if (memberships.length > 1) return { ok: false, reason: "selection_required" };
  return { ok: true, tenantId: memberships[0] ?? null };
}
