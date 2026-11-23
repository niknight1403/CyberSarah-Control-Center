import { describe, expect, it } from "vitest";
import {
  TenantError,
  assertOwnerAccess,
  canAccessOwner,
  ownerForWrite,
  resolveTenant,
} from "../lib/tenant-logic";

const anna = { openId: "openid-anna", role: "user" };
const admin = { openId: "openid-admin", role: "admin" };

describe("resolveTenant", () => {
  it("baut den Mandanten aus dem Konto", () => {
    expect(resolveTenant(anna)).toEqual({ openId: "openid-anna", isAdmin: false });
    expect(resolveTenant(admin)).toEqual({ openId: "openid-admin", isAdmin: true });
  });

  it("verweigert Zugriff ohne Konto", () => {
    expect(() => resolveTenant(null)).toThrow(TenantError);
    expect(() => resolveTenant({ openId: "   " })).toThrow(/Anmeldung/);
    expect(() => resolveTenant({ openId: "x", role: "user" })).not.toThrow();
  });
});

describe("canAccessOwner", () => {
  it("erlaubt eigene Datensaetze", () => {
    expect(canAccessOwner(resolveTenant(anna), "openid-anna")).toBe(true);
  });

  it("verweigert fremde Datensaetze", () => {
    expect(canAccessOwner(resolveTenant(anna), "openid-bert")).toBe(false);
  });

  it("laesst Admins alle Datensaetze sehen", () => {
    expect(canAccessOwner(resolveTenant(admin), "openid-bert")).toBe(true);
    expect(canAccessOwner(resolveTenant(admin), null)).toBe(true);
  });

  it("behandelt Altbestand ohne Eigentuemer fuer normale Konten als fremd", () => {
    expect(canAccessOwner(resolveTenant(anna), null)).toBe(false);
    expect(canAccessOwner(resolveTenant(anna), undefined)).toBe(false);
  });
});

describe("assertOwnerAccess", () => {
  it("wirft FORBIDDEN-Klasse bei fremdem Datensatz", () => {
    const tenant = resolveTenant(anna);
    expect(() => assertOwnerAccess(tenant, "openid-bert", "Diese Kampagne")).toThrow(TenantError);
    try {
      assertOwnerAccess(tenant, "openid-bert", "Diese Kampagne");
    } catch (error) {
      expect((error as TenantError).code).toBe("forbidden");
      expect((error as TenantError).message).toContain("Diese Kampagne");
    }
    expect(() => assertOwnerAccess(tenant, "openid-anna")).not.toThrow();
  });
});

describe("ownerForWrite", () => {
  it("schreibt immer das angemeldete Konto als Eigentuemer", () => {
    expect(ownerForWrite(resolveTenant(anna))).toBe("openid-anna");
    expect(ownerForWrite(resolveTenant(admin))).toBe("openid-admin");
  });
});
