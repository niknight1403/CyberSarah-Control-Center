/**
 * Sprint 347 — Tests fuer lokale Push-Benachrichtigungen.
 */
import { describe, it, expect } from "vitest";
import {
  scheduleLocalNotification,
  filterPendingNotifications,
  nextTriggerTime,
  getLocalNotificationStatus,
  NotificationCategory,
  NotificationPermission,
} from "@/lib/local-notifications-logic";

describe("Sprint 347 — Local Notifications Logic", () => {
  it("plant eine Notification mit Berechtigung", () => {
    const n = scheduleLocalNotification({
      category: "task-reminder",
      title: "Test",
      body: "Body",
      delayMs: 5000,
      permission: "granted",
    });
    expect(n).not.toBeNull();
    expect(n!.title).toBe("Test");
    expect(n!.triggerAtMs).toBeGreaterThan(Date.now());
  });

  it("verweigert Planung ohne Berechtigung (ehrlich null)", () => {
    const n = scheduleLocalNotification({
      category: "chat-reply",
      title: "T",
      body: "B",
      delayMs: 1000,
      permission: "denied",
    });
    expect(n).toBeNull();
  });

  it("verweigert Planung mit negativer Verzoegerung", () => {
    const n = scheduleLocalNotification({
      category: "task-reminder",
      title: "T",
      body: "B",
      delayMs: -100,
      permission: "granted",
    });
    expect(n).toBeNull();
  });

  it("nutzt Standardtitel bei leerem Titel", () => {
    const n = scheduleLocalNotification({
      category: "quota-warning",
      title: "",
      body: "",
      delayMs: 1000,
      permission: "granted",
    });
    expect(n!.title).toBe("Nutzungslimit");
    expect(n!.body).toContain("Kontingent");
  });

  it("filterPendingNotifications entfernt abgelaufene Einmal-Nachrichten", () => {
    const now = Date.now();
    const notifs = [
      { id: "1", title: "a", body: "b", category: "task-reminder" as const, triggerAtMs: now - 1000, repeatIntervalMs: null },
      { id: "2", title: "b", body: "c", category: "task-reminder" as const, triggerAtMs: now + 5000, repeatIntervalMs: null },
    ];
    const pending = filterPendingNotifications(notifs, now);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("2");
  });

  it("filterPendingNotifications behaelt wiederkehrende Notifications", () => {
    const now = Date.now();
    const notifs = [
      { id: "1", title: "a", body: "b", category: "task-reminder" as const, triggerAtMs: now - 10000, repeatIntervalMs: 60000 },
    ];
    const pending = filterPendingNotifications(notifs, now);
    expect(pending).toHaveLength(1);
  });

  it("nextTriggerTime berechnet naechste Ausloesung fuer wiederkehrend", () => {
    const base = Date.now() - 65000;
    const n = { id: "1", title: "a", body: "b", category: "task-reminder" as const, triggerAtMs: base, repeatIntervalMs: 60000 };
    const next = nextTriggerTime(n, Date.now());
    expect(next).toBeGreaterThan(Date.now());
  });

  it("nextTriggerTime gibt urspruengliche Zeit fuer Einmal-Nachricht", () => {
    const future = Date.now() + 10000;
    const n = { id: "1", title: "a", body: "b", category: "task-reminder" as const, triggerAtMs: future, repeatIntervalMs: null };
    expect(nextTriggerTime(n, Date.now())).toBe(future);
  });

  it("getLocalNotificationStatus meldet ehrlich die Geraet-Grenze", () => {
    const status = getLocalNotificationStatus("granted");
    expect(status.available).toBe(true);
    expect(status.limitation).toContain("Geraet");
  });

  it("getLocalNotificationStatus meldet verweigerte Berechtigung", () => {
    const status = getLocalNotificationStatus("denied");
    expect(status.available).toBe(false);
    expect(status.message).toContain("abgelehnt");
  });
});
