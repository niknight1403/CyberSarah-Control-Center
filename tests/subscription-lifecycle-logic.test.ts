import { describe, expect, it } from "vitest";

import {
  PAST_DUE_GRACE_DAYS,
  RETENTION_WINDOW_DAYS,
  readSubscriptionLifecycle,
} from "../lib/subscription-lifecycle-logic";

const NOW = Date.UTC(2026, 10, 2, 0, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

describe("readSubscriptionLifecycle — Sprint 26", () => {
  it("liest ein aktives Abo ohne Kuendigung als aktiv und berechtigt", () => {
    const reading = readSubscriptionLifecycle({ status: "active", currentPeriodEnd: iso(NOW + 20 * DAY) }, NOW);
    expect(reading.state).toBe("aktiv");
    expect(reading.entitled).toBe(true);
    expect(reading.canResume).toBe(false);
    expect(reading.retentionEligible).toBe(false);
    expect(reading.warnings).toEqual([]);
  });

  it("haelt den Zugriff bei Kuendigung zum Periodenende bis zum Ende offen", () => {
    const reading = readSubscriptionLifecycle(
      { status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: iso(NOW + 5 * DAY) },
      NOW,
    );
    expect(reading.state).toBe("kuendigt_zum_periodenende");
    expect(reading.entitled).toBe(true);
    expect(reading.canResume).toBe(true);
    expect(reading.daysLeft).toBe(5);
    expect(reading.accessUntil).toBe(iso(NOW + 5 * DAY));
  });

  it("markiert Retention nur innerhalb des Zeitfensters", () => {
    const nah = readSubscriptionLifecycle(
      { status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: iso(NOW + RETENTION_WINDOW_DAYS * DAY) },
      NOW,
    );
    const fern = readSubscriptionLifecycle(
      { status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: iso(NOW + (RETENTION_WINDOW_DAYS + 1) * DAY) },
      NOW,
    );
    expect(nah.retentionEligible).toBe(true);
    expect(fern.retentionEligible).toBe(false);
  });

  it("entzieht den Zugriff nach abgelaufener Kuendigungsfrist", () => {
    const reading = readSubscriptionLifecycle(
      { status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: iso(NOW - DAY) },
      NOW,
    );
    expect(reading.state).toBe("kuendigt_zum_periodenende");
    expect(reading.entitled).toBe(false);
    expect(reading.canResume).toBe(false);
    expect(reading.warnings.join(" ")).toContain("in der Vergangenheit");
  });

  it("gewaehrt bei offener Zahlung nur die konfigurierte Kulanzfrist", () => {
    const innerhalb = readSubscriptionLifecycle(
      { status: "past_due", currentPeriodEnd: iso(NOW - 1 * DAY) },
      NOW,
    );
    const ausserhalb = readSubscriptionLifecycle(
      { status: "past_due", currentPeriodEnd: iso(NOW - (PAST_DUE_GRACE_DAYS + 1) * DAY) },
      NOW,
    );
    expect(innerhalb.state).toBe("zahlung_offen");
    expect(innerhalb.entitled).toBe(true);
    expect(ausserhalb.entitled).toBe(false);
    expect(ausserhalb.reason).toContain("Kulanzfrist abgelaufen");
  });

  it("gibt bei unpaid keinen Kulanzzugriff", () => {
    const reading = readSubscriptionLifecycle({ status: "unpaid", currentPeriodEnd: iso(NOW + 3 * DAY) }, NOW);
    expect(reading.state).toBe("zahlung_offen");
    expect(reading.entitled).toBe(false);
    expect(reading.retentionEligible).toBe(false);
  });

  it("erkennt eine laufende Testphase und deren Ende", () => {
    const laeuft = readSubscriptionLifecycle({ status: "trialing", trialEnd: iso(NOW + 2 * DAY) }, NOW);
    const vorbei = readSubscriptionLifecycle({ status: "trialing", trialEnd: iso(NOW - DAY) }, NOW);
    expect(laeuft.state).toBe("probe");
    expect(laeuft.entitled).toBe(true);
    expect(vorbei.entitled).toBe(false);
  });

  it("wertet einen pausierten Zahlungsabruf als pausiert, ohne den bezahlten Zeitraum zu verleugnen", () => {
    const reading = readSubscriptionLifecycle(
      { status: "active", pausedBehavior: "void", currentPeriodEnd: iso(NOW + 4 * DAY) },
      NOW,
    );
    expect(reading.state).toBe("pausiert");
    expect(reading.entitled).toBe(true);
    expect(reading.warnings.join(" ")).toContain("pausiert");
  });

  it("laesst einen beendeten Vertrag ohne Restlaufzeit ablaufen", () => {
    const reading = readSubscriptionLifecycle({ status: "canceled", currentPeriodEnd: iso(NOW - DAY) }, NOW);
    expect(reading.state).toBe("abgelaufen");
    expect(reading.entitled).toBe(false);
    expect(reading.canResume).toBe(false);
  });

  it("haelt bei canceled mit Restlaufzeit den Zugriff bis zum Periodenende", () => {
    const reading = readSubscriptionLifecycle({ status: "canceled", currentPeriodEnd: iso(NOW + DAY) }, NOW);
    expect(reading.entitled).toBe(true);
    expect(reading.accessUntil).toBe(iso(NOW + DAY));
  });

  it("behandelt unvollstaendige Zahlungen als nicht berechtigt", () => {
    const reading = readSubscriptionLifecycle({ status: "incomplete", currentPeriodEnd: iso(NOW + DAY) }, NOW);
    expect(reading.state).toBe("unvollstaendig");
    expect(reading.entitled).toBe(false);
  });

  it("erfindet ohne Status keinen Zugriff", () => {
    const reading = readSubscriptionLifecycle({}, NOW);
    expect(reading.state).toBe("unbekannt");
    expect(reading.entitled).toBe(false);
    expect(reading.warnings.length).toBe(1);
  });

  it("weist fehlendes Periodenende offen aus statt es zu schaetzen", () => {
    const reading = readSubscriptionLifecycle({ status: "active" }, NOW);
    expect(reading.state).toBe("aktiv");
    expect(reading.entitled).toBe(true);
    expect(reading.accessUntil).toBeNull();
    expect(reading.warnings.join(" ")).toContain("Periodenende unbekannt");
  });

  it("meldet unbekannte Status offen statt sie zu erlauben", () => {
    const reading = readSubscriptionLifecycle({ status: "irgendwas_neues" }, NOW);
    expect(reading.state).toBe("unbekannt");
    expect(reading.entitled).toBe(false);
    expect(reading.warnings.join(" ")).toContain("irgendwas_neues");
  });
});
