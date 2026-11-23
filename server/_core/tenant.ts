/**
 * Block 2 (Multi-Tenancy) — Server-Adapter: Mandant aus dem tRPC-Kontext plus
 * SQL-Filter. Die reine Entscheidungslogik liegt in lib/tenant-logic.ts.
 */
import { eq, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import {
  TenantError,
  assertOwnerAccess,
  canAccessOwner,
  ownerForWrite,
  resolveTenant,
  type Tenant,
  type TenantUser,
} from "../../lib/tenant-logic";

export type { Tenant };

/** Mandant aus ctx.user; uebersetzt Fehler in tRPC-Codes. */
export function tenantOf(user: TenantUser | null | undefined): Tenant {
  try {
    return resolveTenant(user);
  } catch (error) {
    if (error instanceof TenantError && error.code === "unauthenticated") {
      throw new TRPCError({ code: "UNAUTHORIZED", message: error.message });
    }
    throw error;
  }
}

/**
 * SQL-Filter fuer Lesezugriffe: Admin ohne Filter (alle Zeilen),
 * sonst ausschliesslich eigene Zeilen.
 */
export function ownerScope(column: PgColumn, tenant: Tenant): SQL | undefined {
  if (tenant.isAdmin) return undefined;
  return eq(column, tenant.openId);
}

/** Wirft FORBIDDEN, wenn der Datensatz fremd ist. */
export function requireOwnership(
  tenant: Tenant,
  ownerOpenId: string | null | undefined,
  what?: string,
): void {
  try {
    assertOwnerAccess(tenant, ownerOpenId, what);
  } catch (error) {
    if (error instanceof TenantError) {
      throw new TRPCError({ code: "FORBIDDEN", message: error.message });
    }
    throw error;
  }
}

export { canAccessOwner, ownerForWrite };
