import { describe, it, expect, beforeEach } from "vitest";
import { maintenanceModeManager } from "../lib/maintenance-mode-logic";

describe("Sprint 361 — Wartungsmodus Logic", () => {
  beforeEach(() => {
    maintenanceModeManager.resetToDefault();
  });

  it("befindet sich initial im inaktiven Normalbetrieb", () => {
    const status = maintenanceModeManager.getStatus();
    expect(status.state).toBe("inactive");

    const access = maintenanceModeManager.checkAccess({ userRole: "member" });
    expect(access.allowed).toBe(true);
    expect(access.reason).toBe("normal_operation");
  });

  it("plant eine Wartung für die Zukunft", () => {
    const futureStart = Date.now() + 3600000;
    const futureEnd = Date.now() + 7200000;

    const scheduled = maintenanceModeManager.scheduleMaintenance({
      title: "Datenbank-Upgrade",
      message: "Upgrade auf PostgreSQL 16",
      scheduledStartTime: futureStart,
      estimatedEndTime: futureEnd,
      actorUserId: "admin-1",
    });

    expect(scheduled.state).toBe("scheduled");
    expect(scheduled.title).toBe("Datenbank-Upgrade");

    // Standard user requests should still be allowed during scheduled phase
    const access = maintenanceModeManager.checkAccess({ userRole: "member" });
    expect(access.allowed).toBe(true);
  });

  it("blockiert Standard-Nutzer bei aktivem Wartungsmodus", () => {
    maintenanceModeManager.activateMaintenance({
      message: "Dringendes Sicherheits-Update",
      actorUserId: "admin-1",
    });

    const access = maintenanceModeManager.checkAccess({
      userRole: "member",
      ipAddress: "203.0.113.42",
    });

    expect(access.allowed).toBe(false);
    expect(access.reason).toBe("maintenance_blocked");
    expect(access.lockScreenPayload).toBeDefined();
    expect(access.lockScreenPayload?.title).toBe("Systemwartung");
    expect(access.lockScreenPayload?.message).toBe("Dringendes Sicherheits-Update");
  });

  it("gewährt Admin-Rollen und Bypass-Tokens trotz Wartung Zugriff", () => {
    maintenanceModeManager.activateMaintenance({
      actorUserId: "admin-1",
    });

    // Admin role bypass
    const adminAccess = maintenanceModeManager.checkAccess({ userRole: "admin" });
    expect(adminAccess.allowed).toBe(true);
    expect(adminAccess.reason).toBe("role_bypass");

    // IP bypass
    const ipAccess = maintenanceModeManager.checkAccess({ ipAddress: "127.0.0.1" });
    expect(ipAccess.allowed).toBe(true);
    expect(ipAccess.reason).toBe("ip_bypass");

    // Bypass token
    const tokenAccess = maintenanceModeManager.checkAccess({
      bypassToken: "maint_bypass_cybersarah_2026",
    });
    expect(tokenAccess.allowed).toBe(true);
    expect(tokenAccess.reason).toBe("token_bypass");
  });

  it("schaltet automatisch von 'scheduled' auf 'active' um sobald Startzeit erreicht ist", () => {
    const pastStart = Date.now() - 1000;
    const futureEnd = Date.now() + 3600000;

    maintenanceModeManager.scheduleMaintenance({
      message: "Automatischer Test",
      scheduledStartTime: pastStart,
      estimatedEndTime: futureEnd,
      actorUserId: "admin-1",
    });

    const status = maintenanceModeManager.getStatus();
    expect(status.state).toBe("active");
  });

  it("deaktiviert Wartungsmodus und erlaubt allen Nutzern wieder Zugriff", () => {
    maintenanceModeManager.activateMaintenance({ actorUserId: "admin-1" });
    expect(maintenanceModeManager.checkAccess({ userRole: "member" }).allowed).toBe(false);

    maintenanceModeManager.deactivateMaintenance("admin-1", "Wartung erfolgreich abgeschlossen");
    expect(maintenanceModeManager.checkAccess({ userRole: "member" }).allowed).toBe(true);
    expect(maintenanceModeManager.getStatus().state).toBe("inactive");
  });
});
