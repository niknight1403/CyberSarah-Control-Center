/**
 * Sprint 357 — Nutzer-Verwaltung: Liste, Rollen, Suche.
 *
 * Administrative Nutzerverwaltung mit Rollen- und Rechteverwaltung,
 * Such- und Filterfunktionen, Paginierung, Statusänderungen (Aktivierung/Sperrung)
 * und Bulk-Operationen.
 */

export type AdminRole = "admin" | "operator" | "member" | "viewer" | "guest";
export type UserStatus = "active" | "suspended" | "pending";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  status: UserStatus;
  createdAt: number;
  lastActiveAt?: number;
  customPermissions?: string[];
  metadata?: Record<string, string>;
}

export const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  admin: ["*"],
  operator: ["read:all", "ops:manage", "playbook:execute", "dashboard:view", "logs:view"],
  member: ["read:chat", "write:chat", "dashboard:view"],
  viewer: ["read:chat", "dashboard:view"],
  guest: ["read:limited"],
};

export interface UserSearchQuery {
  searchTerm?: string;
  roleFilter?: AdminRole | "all";
  statusFilter?: UserStatus | "all";
  page?: number;
  pageSize?: number;
  sortBy?: "name" | "email" | "createdAt" | "lastActiveAt";
  sortOrder?: "asc" | "desc";
}

export interface PaginatedUsersResult {
  users: AdminUser[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UserAuditMeta {
  userId: string;
  previousValue: string;
  newValue: string;
  changedBy: string;
  timestamp: number;
}

/** Überprüft, ob ein Nutzer eine bestimmte Berechtigung besitzt. */
export function hasPermission(user: AdminUser, requiredPermission: string): boolean {
  if (user.status !== "active") return false;

  const rolePerms = ROLE_PERMISSIONS[user.role] || [];
  if (rolePerms.includes("*")) return true;

  if (rolePerms.includes(requiredPermission)) return true;

  if (user.customPermissions && user.customPermissions.includes(requiredPermission)) {
    return true;
  }

  return false;
}

/** Filtert, sortiert und paginiert eine Nutzerliste. */
export function filterAndPaginateUsers(
  users: AdminUser[],
  query: UserSearchQuery = {}
): PaginatedUsersResult {
  let filtered = [...users];

  // 1. Suche nach Name, E-Mail oder ID
  if (query.searchTerm && query.searchTerm.trim().length > 0) {
    const term = query.searchTerm.trim().toLowerCase();
    filtered = filtered.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term) ||
        u.id.toLowerCase().includes(term)
    );
  }

  // 2. Rollen-Filter
  if (query.roleFilter && query.roleFilter !== "all") {
    filtered = filtered.filter((u) => u.role === query.roleFilter);
  }

  // 3. Status-Filter
  if (query.statusFilter && query.statusFilter !== "all") {
    filtered = filtered.filter((u) => u.status === query.statusFilter);
  }

  // 4. Sortierung
  const sortBy = query.sortBy || "createdAt";
  const sortOrder = query.sortOrder || "desc";

  filtered.sort((a, b) => {
    let valA = a[sortBy] ?? 0;
    let valB = b[sortBy] ?? 0;

    if (typeof valA === "string") valA = (valA as string).toLowerCase();
    if (typeof valB === "string") valB = (valB as string).toLowerCase();

    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  // 5. Paginierung
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.max(1, Math.min(100, query.pageSize || 20));
  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const startIndex = (page - 1) * pageSize;
  const paginatedUsers = filtered.slice(startIndex, startIndex + pageSize);

  return {
    users: paginatedUsers,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

/** Ändert die Rolle eines Nutzers und erzeugt Metadaten für das Audit-Log. */
export function updateUserRole(
  users: AdminUser[],
  userId: string,
  newRole: AdminRole,
  updatedBy: string,
  nowMs: number = Date.now()
): { updatedUsers: AdminUser[]; updatedUser: AdminUser; auditMeta: UserAuditMeta } {
  const targetIndex = users.findIndex((u) => u.id === userId);
  if (targetIndex === -1) {
    throw new Error(`Nutzer mit ID '${userId}' nicht gefunden.`);
  }

  const targetUser = users[targetIndex];
  const previousRole = targetUser.role;

  const updatedUser: AdminUser = {
    ...targetUser,
    role: newRole,
  };

  const updatedUsers = [...users];
  updatedUsers[targetIndex] = updatedUser;

  const auditMeta: UserAuditMeta = {
    userId,
    previousValue: previousRole,
    newValue: newRole,
    changedBy: updatedBy,
    timestamp: nowMs,
  };

  return { updatedUsers, updatedUser, auditMeta };
}

/** Ändert den Status eines Nutzers (z. B. Aktivieren / Sperren). */
export function updateUserStatus(
  users: AdminUser[],
  userId: string,
  newStatus: UserStatus,
  updatedBy: string,
  nowMs: number = Date.now()
): { updatedUsers: AdminUser[]; updatedUser: AdminUser; auditMeta: UserAuditMeta } {
  const targetIndex = users.findIndex((u) => u.id === userId);
  if (targetIndex === -1) {
    throw new Error(`Nutzer mit ID '${userId}' nicht gefunden.`);
  }

  const targetUser = users[targetIndex];
  const previousStatus = targetUser.status;

  const updatedUser: AdminUser = {
    ...targetUser,
    status: newStatus,
  };

  const updatedUsers = [...users];
  updatedUsers[targetIndex] = updatedUser;

  const auditMeta: UserAuditMeta = {
    userId,
    previousValue: previousStatus,
    newValue: newStatus,
    changedBy: updatedBy,
    timestamp: nowMs,
  };

  return { updatedUsers, updatedUser, auditMeta };
}

/** Führt eine Rollen-Aktualisierung für mehrere Nutzer gleichzeitig durch. */
export function bulkUpdateUsersRole(
  users: AdminUser[],
  userIds: string[],
  newRole: AdminRole,
  updatedBy: string,
  nowMs: number = Date.now()
): { updatedUsers: AdminUser[]; auditMetas: UserAuditMeta[] } {
  let currentUsers = [...users];
  const auditMetas: UserAuditMeta[] = [];

  for (const id of userIds) {
    if (currentUsers.some((u) => u.id === id)) {
      const res = updateUserRole(currentUsers, id, newRole, updatedBy, nowMs);
      currentUsers = res.updatedUsers;
      auditMetas.push(res.auditMeta);
    }
  }

  return { updatedUsers: currentUsers, auditMetas };
}
