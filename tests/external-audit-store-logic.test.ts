import { describe, expect, it, vi } from "vitest";
import { createRotatingAuditStore, auditEntryFromEvent, exportStoreAudit, recordAuditEvent, type ExternalAuditStore } from "../lib/external-audit-store-logic";
import { withRotation } from "../lib/external-action-audit-service";
import type { AuditEntry, RotationConfig } from "../lib/audit-rotation-logic";

const NOW_MS = 1_750_000_000_000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function config(overrides: Partial<RotationConfig> = {}): RotationConfig {
  return { nowMs: NOW_MS, maxEntries: 10, maxAgeMs: MAX_AGE_MS, ...overrides };
}

function eventInput(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "evt-1",
    action: "build" as const,
    status: "passed" as const,
    occurredAt: new Date(NOW_MS - 1000).toISOString(),
    ...overrides,
  };
}

describe("external audit store logic", () => {
  it("maps audit events onto sprint 37 audit entries", () => {
    const entry = auditEntryFromEvent({
      eventId: "evt-map",
      action: "push",
      status: "failed",
      repository: "CyberSarah-Control-Center",
      branch: "main",
      commitSha: "abc123",
      runId: "run-9",
      message: "Build fehlgeschlagen",
      occurredAt: new Date(NOW_MS - 5000).toISOString(),
      metadata: { duration: 42 },
    });
    expect(entry.id).toBe("evt-map");
    expect(entry.actor).toBe("external-action");
    expect(entry.action).toBe("push");
    expect(entry.timestampMs).toBe(NOW_MS - 5000);
    expect(entry.metadata).toMatchObject({
      action: "push",
      status: "failed",
      repository: "CyberSarah-Control-Center",
      branch: "main",
      commitSha: "abc123",
      runId: "run-9",
      message: "Build fehlgeschlagen",
      duration: 42,
    });
  });

  it("records events, calls the transport once, and applies rotation", async () => {
    const store = createRotatingAuditStore(config());
    const transport = vi.fn();
    const outcome = await recordAuditEvent(store, eventInput({ eventId: "evt-2" }), transport);
    expect(outcome.entry.id).toBe("evt-2");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0].eventId).toBe("evt-2");
    expect(outcome.rotation.removedCount).toBe(0);
    expect(store.entries).toHaveLength(1);
  });

  it("keeps only the newest entries beyond the configured limit", async () => {
    const store = createRotatingAuditStore(config({ maxEntries: 2 }));
    for (const [id, offset] of [["alt", 3000], ["mittel", 2000], ["neu", 1000]] as const) {
      await recordAuditEvent(
        store,
        eventInput({ eventId: id, occurredAt: new Date(NOW_MS - offset).toISOString() }),
      );
    }
    expect(store.entries.map((entry) => entry.id)).toEqual(["neu", "mittel"]);
  });

  it("drops entries older than the configured age window", async () => {
    const store = createRotatingAuditStore(config());
    await recordAuditEvent(store, eventInput({ eventId: "alt", occurredAt: new Date(NOW_MS - MAX_AGE_MS - 10).toISOString() }));
    expect(store.entries).toHaveLength(0);
    await recordAuditEvent(store, eventInput({ eventId: "neu" }));
    expect(store.entries.map((entry) => entry.id)).toEqual(["neu"]);
  });

  it("rejects invalid rotation configs through the sprint 37 rules", async () => {
    const store = createRotatingAuditStore(config({ maxEntries: 0 }));
    await expect(recordAuditEvent(store, eventInput())).rejects.toThrow();
  });

  it("exports token-free logs with a traceable redaction count", async () => {
    const store = createRotatingAuditStore(config());
    await recordAuditEvent(
      store,
      eventInput({ eventId: "evt-sec", metadata: { apiKey: "ghp_geheim", note: "https://internal.example/xyz" } }),
    );
    const exported = exportStoreAudit(store, NOW_MS);
    const serialized = JSON.stringify(exported);
    // Sensible Schlüssel werden entfernt, sensible Werte redigiert — der
    // Zähler macht beides nachvollziehbar (1 entfernt + 1 redigiert).
    expect(exported.redactedFieldCount).toBe(2);
    expect("apiKey" in exported.entries[0].metadata).toBe(false);
    expect(exported.entries[0].metadata.note).toBe("[redigiert]");
    expect(serialized).not.toMatch(/ghp_|sk-|api[-_]?key\s*[:=]|https?:\/\//i);
  });

  it("connects the service with rotation through withRotation", async () => {
    const recorder = withRotation(config({ maxEntries: 1 }));
    await recorder.record(eventInput({ eventId: "a", occurredAt: new Date(NOW_MS - 2000).toISOString() }));
    await recorder.record(eventInput({ eventId: "b", occurredAt: new Date(NOW_MS - 1000).toISOString() }));
    expect(recorder.store.entries.map((entry) => entry.id)).toEqual(["b"]);
    const exported = recorder.export(NOW_MS);
    expect(exported.entries.map((entry) => entry.id)).toEqual(["b"]);
    expect(exported.exportedAtMs).toBe(NOW_MS);
  });

  it("produces deterministic exports for identical inputs", async () => {
    async function build() {
      const store = createRotatingAuditStore(config());
      await recordAuditEvent(store, eventInput({ eventId: "same" }));
      return exportStoreAudit(store, NOW_MS);
    }
    expect(JSON.stringify(await build())).toBe(JSON.stringify(await build()));
  });

  it("sanitizes event metadata before storage", async () => {
    const store: ExternalAuditStore = createRotatingAuditStore(config());
    const outcome = await recordAuditEvent(store, eventInput({ eventId: "evt-x", metadata: { password: "geheim", ok: true } }));
    expect(outcome.event.metadata?.password).toBe("[REDACTED]");
    const entry: AuditEntry = outcome.entry;
    expect(entry.metadata.ok).toBe(true);
  });
});
