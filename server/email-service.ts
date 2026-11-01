/**
 * Sprint 266 — Resend-Versanddienst: Idempotenz-Schluessel in KV,
 * Tageslimit, ehrlicher Nicht-Konfiguriert-Zustand.
 */
import * as db from "./db";
import { EMAIL_LIMITS, evaluateEmailSend, type EmailDispatchInput, type EmailSendOutcome } from "../lib/email-logic";

const SENT_KEY_PREFIX = "email.sent.";
const DAY_COUNT_KEY = "email.daycount.";

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export type EmailServiceResult = EmailSendOutcome & { configured: boolean };

export async function dispatchTransactionalEmail(input: EmailDispatchInput): Promise<EmailServiceResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const configured = Boolean(apiKey && from);
  if (!configured) {
    return { status: "rejected", reason: "Resend ist nicht konfiguriert (RESEND_API_KEY / RESEND_FROM_EMAIL) — Mail wird ehrlich nicht versendet.", configured: false };
  }

  const dayCountKey = `${DAY_COUNT_KEY}${dayKey()}`;
  const sentToday = (await db.getModelRouterSetting<number>(dayCountKey)) ?? 0;
  if (sentToday >= EMAIL_LIMITS.maxMailsPerDay) {
    return { status: "rejected", reason: `Tageslimit erreicht (${sentToday}/${EMAIL_LIMITS.maxMailsPerDay}).`, configured: true };
  }

  const sentKeys = (await db.getModelRouterSetting<string[]>(`${SENT_KEY_PREFIX}index`)) ?? [];
  const evaluation = evaluateEmailSend(input, new Set(sentKeys));
  if (evaluation.outcome.status === "rejected") return { ...evaluation.outcome, configured: true };
  if (evaluation.outcome.status === "duplicate") return { ...evaluation.outcome, configured: true };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.body }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 160);
      return { status: "rejected", reason: `Resend lehnte ab (${response.status}): ${detail}`, configured: true };
    }
    const payload = (await response.json()) as { id?: string };
    const updatedIndex = [...sentKeys, input.idempotencyKey].slice(-500);
    await db.setModelRouterSetting(`${SENT_KEY_PREFIX}index`, updatedIndex);
    await db.setModelRouterSetting(dayCountKey, sentToday + 1);
    return { status: "sent", messageId: payload.id ?? evaluation.outcome.messageId, configured: true };
  } catch (error) {
    return { status: "rejected", reason: `Resend-Aufruf fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannt"}`, configured: true };
  }
}
