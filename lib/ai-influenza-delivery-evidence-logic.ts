/**
 * Delivery proof is intentionally stricter than a task status flag.
 * This validates the shape of stored evidence, not external asset existence.
 * A trusted storage/delivery adapter must verify references before persisting it.
 */
export function verifiedAiInfluenzaDeliveryCount(
  result: Record<string, unknown> | null,
  expectedOrderId: string,
  expectedTaskKind: string,
): number {
  if (!result || result.deliveryVerified !== true || result.customerApproved !== true ||
      result.orderId !== expectedOrderId || result.taskKind !== expectedTaskKind) return 0;
  if (typeof result.approvedBy !== "string" || !result.approvedBy.trim() ||
      typeof result.approvedAt !== "string" || !Number.isFinite(Date.parse(result.approvedAt)) ||
      typeof result.deliveredAt !== "string" || !Number.isFinite(Date.parse(result.deliveredAt))) return 0;
  const references = result.deliveredAssetIds;
  if (!Array.isArray(references) || references.length === 0 ||
      references.some((ref) => typeof ref !== "string" || !ref.trim() || ref.length > 250) ||
      new Set(references).size !== references.length) return 0;
  const count = result.deliveredQuantity;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count <= 0 ||
      count !== references.length) return 0;
  return count;
}
