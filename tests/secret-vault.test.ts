/**
 * Sprint 167 — Secret-Vault: Verarbeitung + sichere Ablage
 *
 * Der Superagent-Chat (und der Repo-/Entwicklungs-Chat) muss Secrets
 * verarbeiten koennen wie der Base44-Superagent: erkannte Keys werden
 * AUTONOM verschluesselt gespeichert, der Klartext NIE im Chatverlauf
 * abgelegt, Listen zeigen ausschliesslich Metadaten + Maskierung.
 *
 * Server-Vault wird mit gemocktem KV (db) getestet — die reine Logik
 * (Erkennung, Maskierung, Namen) ohne Mock.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  buildSecretStoredNotice,
  detectSecretCandidates,
  isValidSecretName,
  isValidSecretValue,
  maskSecretValue,
  maskSecretsInText,
  normalizeSecretName,
} from "../lib/secret-vault-logic";
import { setModelRouterKvForTests } from "../server/db";
import {
  deleteSecret,
  listSecrets,
  processSecretsInUserMessage,
  resolveSecret,
  upsertSecret,
} from "../server/secret-vault";

// KV-Mock (Sprint 190): In-Memory-Map, gebunden ueber den Test-Hook
// setVaultKvForTests statt vi.mock("../server/db") — unter isolate:false
// (Sprint 187) ist die vi.mock-Auflösung von der Worker-/Ausfuehrungsreihenfolge
// abhaengig; der injizierte Adapter ist auf jedem Rechner deterministisch.
const kvStore = new Map<string, unknown>();
beforeAll(() => {
  setModelRouterKvForTests(kvStore);
});
afterAll(() => {
  setModelRouterKvForTests(null); // isolate:false: Hook fuer Folgedateien loesen
});

const USER = "vault-test-user";

const GROQ_KEY = "gsk_abcdefghijklmnopqrstuvwxyz012345";
const GITHUB_TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD";

describe("secret-vault-logic (reine Erkennung + Maskierung)", () => {
  it("normalisiert und validiert Vault-Namen", () => {
    expect(normalizeSecretName(" groq api key ")).toBe("GROQ_API_KEY");
    expect(isValidSecretName("GROQ_API_KEY")).toBe(true);
    expect(isValidSecretName("AB")).toBe(false); // zu kurz
    expect(isValidSecretName("zu-langer-name-der-sicher-uber-vierzig-zeichen-hat-12345")).toBe(false);
    expect(isValidSecretValue("  kurz  ")).toBe(false);
    expect(isValidSecretValue("gueltiger-wert-123")).toBe(true);
  });

  it("maskiert Werte ohne Klartext-Offenbarung", () => {
    const masked = maskSecretValue(GROQ_KEY);
    expect(masked).not.toContain(GROQ_KEY);
    expect(masked).toMatch(/^gsk/);
    expect(maskSecretValue("kurz")).toBe("••••••");
  });

  it("erkennt gaengige Key-Formate mit Art und Namen", () => {
    const found = detectSecretCandidates(`Hier mein Groq-Key: ${GROQ_KEY} und GitHub: ${GITHUB_TOKEN}`);
    const kinds = found.map((c) => c.kind);
    expect(kinds).toContain("groq");
    expect(kinds).toContain("github");
    const groq = found.find((c) => c.kind === "groq");
    expect(groq?.value).toBe(GROQ_KEY);
    expect(groq?.suggestedName).toBe("GROQ_API_KEY");
  });

  it("ignoriert kurze/harmlose Strings bewusst (keine False Positives)", () => {
    expect(detectSecretCandidates("normaler Text ohne jeden Key")).toHaveLength(0);
    expect(detectSecretCandidates("gsk_zukurz")).toHaveLength(0);
  });

  it("maskiert ALLE Kandidaten im Text (persistierbar, kein Klartext)", () => {
    const { maskedText, candidates } = maskSecretsInText(`Nutze ${GROQ_KEY} und ${GITHUB_TOKEN} bitte.`);
    expect(candidates).toHaveLength(2);
    expect(maskedText).not.toContain(GROQ_KEY);
    expect(maskedText).not.toContain(GITHUB_TOKEN);
    expect(maskedText).toContain("[GROQ_API_KEY_GESPEICHERT]");
    expect(maskedText).toContain("[GITHUB_TOKEN_GESPEICHERT]");
  });

  it("baut einen klartextfreien Speicher-Hinweis", () => {
    const notice = buildSecretStoredNotice(["GROQ_API_KEY"]);
    expect(notice).toContain("1 Secret");
    expect(notice).toContain("GROQ_API_KEY");
    expect(notice).not.toContain(GROQ_KEY);
    expect(buildSecretStoredNotice([])).toBeNull();
  });
});

describe("server/secret-vault (verschluesselte Ablage, KV-gemockt)", () => {
  beforeEach(() => {
    kvStore.clear();
    process.env.PROVIDER_KEY_ENCRYPTION_SECRET = "test-encryption-secret-sprint-167";
  });

  it("speichert ein Secret verschluesselt und listet NUR Metadaten", async () => {
    const meta = await upsertSecret(USER, { name: "groq api key", value: GROQ_KEY, kind: "groq", note: "Chat-Testkey" });
    expect(meta.name).toBe("GROQ_API_KEY");
    expect(meta.hint).not.toContain(GROQ_KEY);

    const list = await listSecrets(USER);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("GROQ_API_KEY");
    expect(list[0].hint).not.toContain(GROQ_KEY);
    // Roher KV-Datensatz enthaelt NUR die Verschluesselung, nie Klartext.
    const raw = JSON.stringify([...kvStore.values()]);
    expect(raw).not.toContain(GROQ_KEY);
    expect(raw).toContain("\"encrypted\""); // iv:tag:ciphertext im hex-Payload
  });

  it("aktualisiert denselben Namen idempotent (neue updatedAt, gleiche created)", async () => {
    const first = await upsertSecret(USER, { name: "GROQ_API_KEY", value: GROQ_KEY });
    await new Promise((r) => setTimeout(r, 5));
    const second = await upsertSecret(USER, { name: "GROQ_API_KEY", value: "gsk_anderer-key-0123456789abcdef" });
    const list = await listSecrets(USER);
    expect(list).toHaveLength(1);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt >= first.updatedAt).toBe(true);
    // Neuer Wert ist aktiv:
    expect(await resolveSecret(USER, "GROQ_API_KEY")).toBe("gsk_anderer-key-0123456789abcdef");
  });

  it("loescht Secrets ehrlich (false bei Unbekannten)", async () => {
    await upsertSecret(USER, { name: "GITHUB_TOKEN", value: GITHUB_TOKEN });
    expect(await deleteSecret(USER, "GITHUB_TOKEN")).toBe(true);
    expect(await deleteSecret(USER, "GITHUB_TOKEN")).toBe(false);
    expect(await listSecrets(USER)).toHaveLength(0);
  });

  it("resolveSecret liefert den Klartext nur intern (oder null)", async () => {
    await upsertSecret(USER, { name: "GEMINI_API_KEY", value: "AIzaSy" + "A".repeat(29), kind: "google" });
    expect(await resolveSecret(USER, "gemini_api_key")).toBe("AIzaSy" + "A".repeat(29));
    expect(await resolveSecret(USER, "GIBTS_NICHT")).toBeNull();
  });

  it("verarbeitet Chat-Nachrichten: speichert autonom, maskiert Klartext", async () => {
    const message = `Bitte nutze meinen Groq-Key ${GROQ_KEY} für alles.`;
    const result = await processSecretsInUserMessage(USER, message);
    expect(result.storedNames).toContain("GROQ_API_KEY");
    expect(result.sanitizedText).not.toContain(GROQ_KEY);
    expect(result.sanitizedText).toContain("[GROQ_API_KEY_GESPEICHERT]");
    expect(result.notice).toContain("GROQ_API_KEY");
    // Wert liegt entschlüsselbar im Vault:
    expect(await resolveSecret(USER, "GROQ_API_KEY")).toBe(GROQ_KEY);
  });

  it("ohne erkannte Secrets bleibt die Nachricht unangetastet", async () => {
    const result = await processSecretsInUserMessage(USER, "Ganz normale Nachricht ohne Key.");
    expect(result.sanitizedText).toBe("Ganz normale Nachricht ohne Key.");
    expect(result.storedNames).toHaveLength(0);
    expect(result.notice).toBeNull();
  });

  it("ohne Server-Secret bleibt die Ablage ehrlich deaktiviert", async () => {
    delete process.env.PROVIDER_KEY_ENCRYPTION_SECRET;
    process.env.JWT_SECRET = "";
    await expect(upsertSecret(USER, { name: "NOPE_KEY", value: GROQ_KEY })).rejects.toThrow(/Server-Secret/);
    process.env.PROVIDER_KEY_ENCRYPTION_SECRET = "test-encryption-secret-sprint-167";
  });
});
