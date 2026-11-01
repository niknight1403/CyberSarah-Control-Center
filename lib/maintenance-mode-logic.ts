/**
 * Sprint 361 — Wartungsmodus: Ankündigung + klarer Sperrbildschirm.
 *
 * Verwaltet den System-Wartungsmodus: Ankündigungen, automatischer Start,
 * Ausnahmeregeln (Admin-Rollen, IP-Whitelist, Bypass-Token) und Sperrbildschirm-Payloads.
 */

export type MaintenanceState = "inactive" | "scheduled" | "active";

export interface MaintenanceConfig {
  id: string;
  state: MaintenanceState;
  title: string;
  message: string;
  scheduledStartTime: number | null;
  estimatedEndTime: number | null;
  actualStartTime: number | null;
  actualEndTime: number | null;
  affectedModules: string[];
  allowedRoles: string[];
  allowedIps: string[];
  bypassToken: string | null;
  supportContact: string;
  updatedByUserId?: string;
  updatedAt: number;
}

export interface AccessCheckContext {
  userRole?: string;
  ipAddress?: string;
  bypassToken?: string;
}

export interface AccessCheckResult {
  allowed: boolean;
  reason: "normal_operation" | "role_bypass" | "ip_bypass" | "token_bypass" | "maintenance_blocked";
  lockScreenPayload?: LockScreenPayload;
}

export interface LockScreenPayload {
  state: MaintenanceState;
  title: string;
  message: string;
  scheduledStartTime: number | null;
  estimatedEndTime: number | null;
  affectedModules: string[];
  supportContact: string;
  countdownSeconds: number | null;
}

export interface MaintenanceAuditEntry {
  timestamp: number;
  actorUserId: string;
  previousState: MaintenanceState;
  newState: MaintenanceState;
  reason: string;
}

class MaintenanceModeManager {
  private config: MaintenanceConfig;
  private auditLogs: MaintenanceAuditEntry[] = [];

  constructor() {
    this.config = this.getDefaultConfig();
  }

  private getDefaultConfig(): MaintenanceConfig {
    return {
      id: "maint-config-001",
      state: "inactive",
      title: "Systemwartung",
      message: "Das CyberSarah Control-Center führt geplante Wartungsarbeiten durch.",
      scheduledStartTime: null,
      estimatedEndTime: null,
      actualStartTime: null,
      actualEndTime: null,
      affectedModules: ["API", "Dashboard", "Workflows"],
      allowedRoles: ["admin"],
      allowedIps: ["127.0.0.1", "::1"],
      bypassToken: "maint_bypass_cybersarah_2026",
      supportContact: "support@cybersarah-ki.com",
      updatedAt: Date.now(),
    };
  }

  public getStatus(): MaintenanceConfig {
    this.checkAutoTransition();
    return { ...this.config };
  }

  private checkAutoTransition(): void {
    if (this.config.state === "scheduled" && this.config.scheduledStartTime) {
      if (Date.now() >= this.config.scheduledStartTime) {
        const oldState = this.config.state;
        this.config.state = "active";
        this.config.actualStartTime = Date.now();
        this.config.updatedAt = Date.now();

        this.auditLogs.unshift({
          timestamp: Date.now(),
          actorUserId: "system_scheduler",
          previousState: oldState,
          newState: "active",
          reason: "Automatischer Wartungsstart bei Erreichen der Startzeit",
        });
      }
    }
  }

  public scheduleMaintenance(
    params: {
      title?: string;
      message: string;
      scheduledStartTime: number;
      estimatedEndTime: number;
      affectedModules?: string[];
      actorUserId: string;
    }
  ): MaintenanceConfig {
    const oldState = this.config.state;
    this.config.state = "scheduled";
    this.config.title = params.title || "Geplante Systemwartung";
    this.config.message = params.message;
    this.config.scheduledStartTime = params.scheduledStartTime;
    this.config.estimatedEndTime = params.estimatedEndTime;
    if (params.affectedModules) {
      this.config.affectedModules = params.affectedModules;
    }
    this.config.updatedByUserId = params.actorUserId;
    this.config.updatedAt = Date.now();

    this.auditLogs.unshift({
      timestamp: Date.now(),
      actorUserId: params.actorUserId,
      previousState: oldState,
      newState: "scheduled",
      reason: `Wartung geplant für ${new Date(params.scheduledStartTime).toISOString()}`,
    });

    this.checkAutoTransition();
    return { ...this.config };
  }

  public activateMaintenance(
    params: {
      message?: string;
      estimatedEndTime?: number;
      actorUserId: string;
      reason?: string;
    }
  ): MaintenanceConfig {
    const oldState = this.config.state;
    this.config.state = "active";
    if (params.message) this.config.message = params.message;
    if (params.estimatedEndTime) this.config.estimatedEndTime = params.estimatedEndTime;
    this.config.actualStartTime = Date.now();
    this.config.updatedByUserId = params.actorUserId;
    this.config.updatedAt = Date.now();

    this.auditLogs.unshift({
      timestamp: Date.now(),
      actorUserId: params.actorUserId,
      previousState: oldState,
      newState: "active",
      reason: params.reason || "Sofortige Aktivierung des Wartungsmodus",
    });

    return { ...this.config };
  }

  public deactivateMaintenance(actorUserId: string, reason?: string): MaintenanceConfig {
    const oldState = this.config.state;
    this.config.state = "inactive";
    this.config.actualEndTime = Date.now();
    this.config.scheduledStartTime = null;
    this.config.estimatedEndTime = null;
    this.config.updatedByUserId = actorUserId;
    this.config.updatedAt = Date.now();

    this.auditLogs.unshift({
      timestamp: Date.now(),
      actorUserId,
      previousState: oldState,
      newState: "inactive",
      reason: reason || "Wartungsmodus beendet",
    });

    return { ...this.config };
  }

  public checkAccess(context: AccessCheckContext): AccessCheckResult {
    this.checkAutoTransition();

    if (this.config.state !== "active") {
      return { allowed: true, reason: "normal_operation" };
    }

    if (context.bypassToken && context.bypassToken === this.config.bypassToken) {
      return { allowed: true, reason: "token_bypass" };
    }

    if (context.userRole && this.config.allowedRoles.includes(context.userRole)) {
      return { allowed: true, reason: "role_bypass" };
    }

    if (context.ipAddress && this.config.allowedIps.includes(context.ipAddress)) {
      return { allowed: true, reason: "ip_bypass" };
    }

    return {
      allowed: false,
      reason: "maintenance_blocked",
      lockScreenPayload: this.getLockScreenPayload(),
    };
  }

  public getLockScreenPayload(): LockScreenPayload {
    this.checkAutoTransition();

    let countdownSeconds: number | null = null;
    if (this.config.estimatedEndTime && this.config.estimatedEndTime > Date.now()) {
      countdownSeconds = Math.max(0, Math.floor((this.config.estimatedEndTime - Date.now()) / 1000));
    }

    return {
      state: this.config.state,
      title: this.config.title,
      message: this.config.message,
      scheduledStartTime: this.config.scheduledStartTime,
      estimatedEndTime: this.config.estimatedEndTime,
      affectedModules: [...this.config.affectedModules],
      supportContact: this.config.supportContact,
      countdownSeconds,
    };
  }

  public updateRules(params: {
    allowedRoles?: string[];
    allowedIps?: string[];
    bypassToken?: string | null;
    supportContact?: string;
  }): MaintenanceConfig {
    if (params.allowedRoles) this.config.allowedRoles = params.allowedRoles;
    if (params.allowedIps) this.config.allowedIps = params.allowedIps;
    if (params.bypassToken !== undefined) this.config.bypassToken = params.bypassToken;
    if (params.supportContact) this.config.supportContact = params.supportContact;
    this.config.updatedAt = Date.now();
    return { ...this.config };
  }

  public getAuditLogs(): MaintenanceAuditEntry[] {
    return [...this.auditLogs];
  }

  public resetToDefault(): void {
    this.config = this.getDefaultConfig();
    this.auditLogs = [];
  }
}

export const maintenanceModeManager = new MaintenanceModeManager();
