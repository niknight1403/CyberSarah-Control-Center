import { describe, it, expect } from "vitest";
import {
  debounceConnectivity,
  planReconnect,
  offlineBannerText,
  shouldResumeQueue,
  describeConnectivity,
} from "@/lib/offline-connectivity-logic";

describe("Sprint 345 — Offline-Konnektivitaet", () => {
  it("Entprellung: erst 3 identische Samples kippen den Zustand, Blips nicht", () => {
    expect(debounceConnectivity([])).toBe("unsicher");
    expect(debounceConnectivity([true, true])).toBe("unsicher"); // zu kurz
    expect(debounceConnectivity([true, true, true])).toBe("online");
    expect(debounceConnectivity([false, false, false])).toBe("offline");
    expect(debounceConnectivity([true, true, false])).toBe("unsicher"); // gemischt
    // Blip mitten drin kippt nichts: ...true false true true true -> online
    expect(debounceConnectivity([true, false, true, true, true])).toBe("online");
  });

  it("Reconnect-Plan nur bei echtem Uebergang offline -> online", () => {
    const stale = ["dashboard", "dashboard", "chat"]; // Duplikat bewusst
    const plan = planReconnect({
      previousState: "offline",
      currentState: "online",
      staleScreens: stale,
      queuedActions: 2,
      offlineDurationMs: 5 * 60_000,
    });
    expect(plan.refreshScreens).toEqual(["dashboard", "chat"]); // dedupliziert
    expect(plan.resumeActionQueue).toBe(true);
    expect(plan.bannerText).toContain("Wieder online nach 5 Min.");
    expect(plan.bannerText).toContain("2 Offline-Aktion(en)");
    const keinUebergang = planReconnect({
      previousState: "unsicher",
      currentState: "online",
      staleScreens: [],
      queuedActions: 1,
      offlineDurationMs: 1_000,
    });
    expect(keinUebergang.refreshScreens).toHaveLength(0);
    expect(keinUebergang.bannerText).toBeNull();
  });

  it("Banner ohne Queue erwaehnt Daten-Auffrischung, nicht Aktionen", () => {
    const plan = planReconnect({
      previousState: "offline",
      currentState: "online",
      staleScreens: ["ops"],
      queuedActions: 0,
      offlineDurationMs: 30_000,
    });
    expect(plan.bannerText).toContain("Daten werden aufgefrischt");
    expect(plan.bannerText).not.toContain("Offline-Aktion");
    expect(plan.resumeActionQueue).toBe(false);
  });

  it("Offline-Banner nur im stabilen Offline-Zustand, Minute ehrlich gerundet", () => {
    expect(offlineBannerText("online", 999_999)).toBeNull();
    expect(offlineBannerText("unsicher", 999_999)).toBeNull();
    expect(offlineBannerText("offline", 30_000)).toContain("koennen aelter sein");
    expect(offlineBannerText("offline", 30_000)).not.toContain("seit");
    expect(offlineBannerText("offline", 120_000)).toContain("seit 2 Min.");
  });

  it("Queue-Resume wartet ehrlich auf stabiles Online", () => {
    expect(shouldResumeQueue("online", 3)).toBe(true);
    expect(shouldResumeQueue("online", 0)).toBe(false);
    expect(shouldResumeQueue("unsicher", 3)).toBe(false);
    expect(shouldResumeQueue("offline", 3)).toBe(false);
  });

  it("Diagnose-Uebersicht nennt Zustand, Dauer und wartende Aktionen", () => {
    expect(describeConnectivity("online", 0, 0)).toBe("Verbindung steht.");
    const text = describeConnectivity("offline", 120_000, 2);
    expect(text).toContain("Offline.");
    expect(describeConnectivity("offline", 180_000, 2)).toContain("Offline-Dauer: 3 Min.");
    expect(text).toContain("2 Aktion(en) warten");
    const unsicher = describeConnectivity("unsicher", 0, 0);
    expect(unsicher).toContain("unsicher");
  });
});
