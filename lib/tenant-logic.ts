/**
 * Block 2 (Multi-Tenancy) — reine Mandanten-Logik, ohne Datenbank.
 *
 * Regel: Ein Konto sieht ausschliesslich seine eigenen Datensaetze.
 * Admins sehen alles (Betriebs- und Support-Sicht). Zeilen ohne Eigentuemer
 * (Altbestand vor Migration 0038) sind nur fuer Admins sichtbar - es wird kein
 * Eigentuemer erfunden.
 */

export type TenantUser = { openId?: string | null; role?: string | null };
export type Tenant = { openId: string; isAdmin: boolean };

export class TenantError extends Error {
  constructor(public readonly code: "unauthenticated" | "forbidden", message: string) {
    super(message);
    this.name = "TenantError";
  }
}

/** Baut den Mandanten aus dem Auth-Kontext; ohne Konto gibt es keinen Zugriff. */
export function resolveTenant(user: TenantUser | null | undefined): Tenant {
  const openId = typeof user?.openId === "string" ? user.openId.trim() : "";
  if (!openId) {
    throw new TenantError("unauthenticated", "Fuer diesen Zugriff ist eine Anmeldung erforderlich.");
  }
  return { openId, isAdmin: user?.role === "admin" };
}

/** Darf der Mandant diesen Datensatz sehen/aendern? */
export function canAccessOwner(tenant: Tenant, ownerOpenId: string | null | undefined): boolean {
  if (tenant.isAdmin) return true;
  if (!ownerOpenId) return false;
  return ownerOpenId === tenant.openId;
}

/** Wirft, wenn der Datensatz einem anderen Konto gehoert. */
export function assertOwnerAccess(
  tenant: Tenant,
  ownerOpenId: string | null | undefined,
  what = "Dieser Datensatz",
): void {
  if (!canAccessOwner(tenant, ownerOpenId)) {
    throw new TenantError("forbidden", `${what} gehoert zu einem anderen Konto.`);
  }
}

/** Eigentuemer fuer neue Datensaetze: immer der angemeldete Mandant. */
export function ownerForWrite(tenant: Tenant): string {
  return tenant.openId;
}
