import { describe, expect, it } from "vitest";
import { roleForPublicRegistration, roleForUserUpsert } from "../lib/account-role-logic";

describe("account role assignment", () => {
  it("keeps every public registration at user role", () => {
    expect(roleForPublicRegistration()).toBe("user");
  });

  it("does not grant a requested admin role without a configured owner identity", () => {
    expect(roleForUserUpsert({
      openId: "attacker-controlled-id",
      ownerOpenId: "",
      requestedRole: "admin",
    })).toBe("user");
  });

  it("does not promote an identity that differs from the explicitly configured owner", () => {
    expect(roleForUserUpsert({
      openId: "another-id",
      ownerOpenId: "trusted-owner-id",
      requestedRole: "admin",
    })).toBe("user");
  });

  it("promotes only the explicitly configured owner identity", () => {
    expect(roleForUserUpsert({
      openId: "trusted-owner-id",
      ownerOpenId: " trusted-owner-id ",
      requestedRole: "user",
    })).toBe("admin");
  });

  it("leaves an existing role untouched when the identity provider sends no role", () => {
    expect(roleForUserUpsert({
      openId: "existing-user-id",
      ownerOpenId: "trusted-owner-id",
    })).toBeUndefined();
  });
});
