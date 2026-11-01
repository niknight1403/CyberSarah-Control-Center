import { describe, it, expect } from "vitest";
import {
  hasPermission,
  filterAndPaginateUsers,
  updateUserRole,
  updateUserStatus,
  bulkUpdateUsersRole,
  AdminUser,
} from "../lib/admin-user-management-logic";

describe("Sprint 357 - Nutzer-Verwaltung Logic", () => {
  const sampleUsers: AdminUser[] = [
    {
      id: "usr-1",
      name: "Alice Admin",
      email: "alice@cybersarah.de",
      role: "admin",
      status: "active",
      createdAt: 1000,
    },
    {
      id: "usr-2",
      name: "Bob Operator",
      email: "bob@cybersarah.de",
      role: "operator",
      status: "active",
      createdAt: 2000,
    },
    {
      id: "usr-3",
      name: "Charlie Member",
      email: "charlie@gmail.com",
      role: "member",
      status: "suspended",
      createdAt: 3000,
    },
    {
      id: "usr-4",
      name: "Doris Viewer",
      email: "doris@gmail.com",
      role: "viewer",
      status: "active",
      createdAt: 4000,
    },
  ];

  it("checks permissions correctly based on roles and status", () => {
    expect(hasPermission(sampleUsers[0], "ops:manage")).toBe(true); // admin has *
    expect(hasPermission(sampleUsers[1], "ops:manage")).toBe(true); // operator has ops:manage
    expect(hasPermission(sampleUsers[1], "users:manage")).toBe(false); // operator lacks users:manage
    expect(hasPermission(sampleUsers[2], "read:chat")).toBe(false); // suspended user has 0 perms
  });

  it("filters and paginates users by search term, role, status", () => {
    const searchRes = filterAndPaginateUsers(sampleUsers, {
      searchTerm: "cyber",
      sortBy: "createdAt",
      sortOrder: "asc",
    });
    expect(searchRes.totalCount).toBe(2);
    expect(searchRes.users.map((u) => u.name)).toEqual(["Alice Admin", "Bob Operator"]);

    const roleRes = filterAndPaginateUsers(sampleUsers, { roleFilter: "viewer" });
    expect(roleRes.totalCount).toBe(1);
    expect(roleRes.users[0].id).toBe("usr-4");

    const statusRes = filterAndPaginateUsers(sampleUsers, { statusFilter: "suspended" });
    expect(statusRes.totalCount).toBe(1);
    expect(statusRes.users[0].id).toBe("usr-3");
  });

  it("updates user role with audit metadata", () => {
    const { updatedUsers, updatedUser, auditMeta } = updateUserRole(
      sampleUsers,
      "usr-2",
      "admin",
      "alice@cybersarah.de"
    );

    expect(updatedUser.role).toBe("admin");
    expect(updatedUsers.find((u) => u.id === "usr-2")?.role).toBe("admin");
    expect(auditMeta.previousValue).toBe("operator");
    expect(auditMeta.newValue).toBe("admin");
  });

  it("updates user status (suspend/reactivate)", () => {
    const { updatedUsers, updatedUser } = updateUserStatus(
      sampleUsers,
      "usr-1",
      "suspended",
      "security-bot"
    );

    expect(updatedUser.status).toBe("suspended");
    expect(updatedUsers.find((u) => u.id === "usr-1")?.status).toBe("suspended");
  });

  it("performs bulk role updates across multiple users", () => {
    const { updatedUsers, auditMetas } = bulkUpdateUsersRole(
      sampleUsers,
      ["usr-3", "usr-4"],
      "operator",
      "admin@cybersarah.de"
    );

    expect(auditMetas.length).toBe(2);
    expect(updatedUsers.find((u) => u.id === "usr-3")?.role).toBe("operator");
    expect(updatedUsers.find((u) => u.id === "usr-4")?.role).toBe("operator");
  });
});
