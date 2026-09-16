/**
 * Self-Healing-Server-Adapter (Sprint 125).
 *
 * Drei Quellen speisen das Incident-Ledger (KV-persistent, Neon):
 *   1. Live-Detektion: Subskription des Runtime-Loggers — jede Server-Fehler-
 *      ausgabe wird gegen die Signatur-Regeln geprueft (Anomalieerkennung).
 *   2. Mobile Crash-Reports: verschluesselte Envelopes (AES-256-GCM, Schlussel
 *      aus ENV.cookieSecret abgeleitet) — PII bleibt unlesbar gespeichert.
 *   3. Manuelle Scans (admin) und der externe Python-Monitor.
 *
 * Automatisierte Korrektur: Bekannte kritische Signatur + Cooldown okay ->
 * Orchestrator-Analyse (Superagent mit Git-Tools) -> Fix-Vorschlag. Ein
 * automatischer Redeploy-Dispatch laeuft NUR mit SELF_HEALING_AUTO_REDEPLOY=true
 * (Standard aus — der Admin schaltet aktivives Enforcing bewusst um, gleiche
 * Rollout-Philosophie wie die Quota-Limitierung).
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import axios from "axios";
import * as db from "./db";
import { subscribeRuntimeLogs, getRuntimeLogs } from "./runtime-logger";
import { runOrchestratorTask } from "./orchestrator/superagent";
import { sendOpsDiscordAlert } from "./ops-alerts";
import {
  buildAnalysisObjective,
  classifyLogLine,
  mergeIncident,
  remedyFor,
  shouldAutoRemedy,
  type AnomalySeverity,
  type AnomalySignatureId,
  type SelfHealingIncident,
} from "../lib/self-healing-logic";

const INDEX_KEY = "selfHealing.incidentIndex";
const LAST_REMEDY_KEY = "selfHealing.lastAutoRemedyAt";
const MAX_INCIDENTS = 200;

let detectorAttached = false;
const lastAutoRemedyAt: Record<string, string> = {};

// ---------------------------------------------------------------------------
// Verschluesselung (Mobile-Crash-Envelopes, at-rest)
// ---------------------------------------------------------------------------

function deriveKey(): Buffer {
  const secret = process.env.JWT_SECRET ?? "cybersarah-dev-fallback";
  return scryptSync(secret, "cybersarah-selfhealing-salt", 32);
}

/** AES-256-GCM: verschluesselt Crash-Payloads vor der Persistenz. */
export function encryptAtRest(payload: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(payload, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${encrypted.toString("base64")}.${tag.toString("base64")}`;
}

/** Entschluesselung fuer die Admin-Ansicht (nur adminProcedure). */
export function decryptAtRest(envelope: string): string | null {
  try {
    const [ivPart, dataPart, tagPart] = envelope.split(".");
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivPart, "base64"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64")), decipher.final()]).toString("utf-8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Incident-Ledger
// ---------------------------------------------------------------------------

async function loadIndex(): Promise<SelfHealingIncident[]> {
  try {
    const index = await db.getModelRouterSetting<SelfHealingIncident[]>(INDEX_KEY);
    return Array.isArray(index) ? index : [];
  } catch {
    return [];
  }
}

async function persist(incidents: SelfHealingIncident[]): Promise<void> {
  await db.setModelRouterSetting(INDEX_KEY, incidents.slice(0, MAX_INCIDENTS));
}

async function recordIncident(
  input: Omit<SelfHealingIncident, "id" | "status" | "occurrenceCount" | "firstSeenAt" | "lastSeenAt">,
): Promise<{ incident: SelfHealingIncident; isNew: boolean }> {
  const incidents = await loadIndex();
  const result = mergeIncident(incidents, input);
  await persist(result.incidents);

  if (result.isNew && result.incident.severity === "critical") {
    // Ops-Alert parallel — Incident-Ledger ist Quelle der Wahrheit.
    void sendOpsDiscordAlert(
      `🚨 Self-Healing: KRITISCH — ${result.incident.finding} (${result.incident.signature})`,
    ).catch(() => undefined);
  }
  return { incident: result.incident, isNew: result.isNew };
}

export async function listIncidents(limit = 50): Promise<SelfHealingIncident[]> {
  const index = await loadIndex();
  return index.slice(0, limit);
}

export async function getIncident(id: string): Promise<SelfHealingIncident | null> {
  return (await loadIndex()).find((incident) => incident.id === id) ?? null;
}

export async function acknowledgeIncident(id: string): Promise<SelfHealingIncident | null> {
  const incidents = await loadIndex();
  const incident = incidents.find((entry) => entry.id === id);
  if (!incident) return null;
  incident.status = "acknowledged";
  await persist(incidents);
  return incident;
}

// ---------------------------------------------------------------------------
// Live-Detektion (Runtime-Logger-Hook)
// ---------------------------------------------------------------------------

/** Dockt den Anomalie-Detektor an den Runtime-Logger an (idempotent). */
export function attachAnomalyDetector(): void {
  if (detectorAttached) return;
  detectorAttached = true;
  subscribeRuntimeLogs((entry) => {
    const match = classifyLogLine(entry.level, entry.message);
    if (!match) return;
    void handleAnomaly(match.signature, match.severity, match.finding, [entry.message]);
  });
}

async function handleAnomaly(
  signature: AnomalySignatureId,
  severity: AnomalySeverity,
  finding: string,
  evidence: string[],
): Promise<void> {
  const { incident, isNew } = await recordIncident({
    source: evidence.length && evidence[0].includes("mobile-crash") ? "mobile_crash" : "server_log",
    signature,
    severity,
    finding,
    evidence,
  });
  if (!isNew) return;

  // Automatisierte Korrektur: bekannte Signatur + Cooldown -> Analyse.
  if (shouldAutoRemedy(incident, lastAutoRemedyAt)) {
    lastAutoRemedyAt[incident.signature] = new Date().toISOString();
    await db.setModelRouterSetting(LAST_REMEDY_KEY, lastAutoRemedyAt);
    const remedy = remedyFor(signature);
    if (remedy === "redeploy" && process.env.SELF_HEALING_AUTO_REDEPLOY === "true") {
      await applyRedeployRemedy(incident.id);
    } else {
      void analyzeIncident(incident.id).catch(() => undefined);
    }
  }
}

/** Manueller Scan des Runtime-Log-Ringpuffers (admin + Python-Monitor). */
export async function scanRuntimeLogsNow(): Promise<{ scanned: number; newIncidents: number }> {
  const logs = getRuntimeLogs();
  let newIncidents = 0;
  for (const entry of logs) {
    const match = classifyLogLine(entry.level, entry.message);
    if (!match) continue;
    const { isNew } = await recordIncident({
      source: "manual_scan",
      signature: match.signature,
      severity: match.severity,
      finding: match.finding,
      evidence: [entry.message],
    });
    if (isNew) newIncidents += 1;
  }
  return { scanned: logs.length, newIncidents };
}

// ---------------------------------------------------------------------------
// Mobile Crash-Reports
// ---------------------------------------------------------------------------

export interface CrashReportInput {
  appVersion: string;
  platform: string;
  message: string;
  stack?: string;
  componentStack?: string;
  breadcrumbs?: string[];
}

export async function recordCrashReport(input: CrashReportInput): Promise<SelfHealingIncident> {
  const plaintext = JSON.stringify({ ...input, reportedAt: new Date().toISOString() });
  const encrypted = encryptAtRest(plaintext);
  const match = classifyLogLine("error", `${input.message}\n${input.stack ?? ""}`) ?? {
    signature: "stack_trace" as AnomalySignatureId,
    severity: "medium" as AnomalySeverity,
    finding: "Unvorhergesehener UI-Absturz (mobil).",
  };
  const { incident } = await recordIncident({
    source: "mobile_crash",
    signature: match.signature,
    severity: match.severity,
    finding: match.finding,
    evidence: [input.message.slice(0, 300), ...(input.stack ? [input.stack.slice(0, 800)] : [])],
    encryptedPayload: encrypted,
  });
  return incident;
}

// ---------------------------------------------------------------------------
// Automatisierte Korrektur (Analyse + Remedy)
// ---------------------------------------------------------------------------

/** Fuehrt den Orchestrator-Superagenten auf ein Incident los (Fix-Vorschlag). */
export async function analyzeIncident(id: string): Promise<SelfHealingIncident | null> {
  const incidents = await loadIndex();
  const incident = incidents.find((entry) => entry.id === id);
  if (!incident) return null;
  incident.status = "analyzing";
  await persist(incidents);

  try {
    const task = await runOrchestratorTask({
      title: `Self-Healing-Analyse: ${incident.signature}`,
      objective: buildAnalysisObjective(incident),
      maxRounds: 10,
    });
    incident.analysisTaskId = task.id;
    incident.analysisResult = task.finalAnswer ?? { summary: task.steps.at(-1)?.logs.at(-1) ?? "Keine finale Antwort." };
    incident.status = task.status === "success" ? "fix_proposed" : "escalated";
  } catch (error) {
    incident.status = "escalated";
    incident.analysisResult = { error: error instanceof Error ? error.message : String(error) };
  }
  await persist(incidents);
  return incident;
}

/** Redeploy-Dispatch ueber den kanonischen GitHub-Workflow (nur mit Token-Env). */
export async function applyRedeployRemedy(id: string): Promise<{ success: boolean; message: string }> {
  const token = process.env.ADMIN_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  const repo = process.env.DEPLOY_REPO ?? "niknight1403/CyberSarah-Control-Center";
  if (!token) {
    return { success: false, message: "Kein GitHub-Token konfiguriert — Redeploy-Remedy nicht moeglich." };
  }
  try {
    const response = await axios.post(
      `https://api.github.com/repos/${repo}/actions/workflows/render-deploy.yml/dispatches`,
      { ref: "main", inputs: { target: "app" } },
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }, timeout: 15_000 },
    );
    const incidents = await loadIndex();
    const incident = incidents.find((entry) => entry.id === id);
    if (incident) {
      incident.status = "remedied";
      incident.appliedRemedy = "Redeploy via render-deploy.yml dispatchiert.";
      await persist(incidents);
    }
    return { success: response.status === 204, message: "Redeploy dispatchiert." };
  } catch (error) {
    return { success: false, message: `Redeploy-Dispatch fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` };
  }
}
