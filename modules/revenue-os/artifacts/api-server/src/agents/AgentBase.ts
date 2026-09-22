import { db } from "@workspace/db";
import { agentsTable, agentLogsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { setzeLLMKontext } from "../middleware/costGuardrail";

export type AgentStatus = "aktiv" | "wartend" | "gestoppt" | "fehler" | "pausiert";

export interface AufgabeErgebnis {
  success: boolean;
  message: string;
  metadaten?: Record<string, unknown>;
  dauer?: number;
}

export interface Aufgabe {
  id: string;
  typ: string;
  payload: Record<string, unknown>;
  prioritaet: 1 | 2 | 3;
  versuche: number;
  maxVersuche: number;
  erstelltAm: Date;
  faelligAb?: Date;
}

const RETRY_BACKOFF_FAKTOREN = [1, 2, 4, 8, 16];

export abstract class AgentBase {
  protected agentId: number | null = null;
  protected agentName: string;
  protected agentTyp: string;
  protected laufend = false;

  // ─── Circuit Breaker ────────────────────────────────────────────────────────
  protected fehlerZaehler = 0;
  protected readonly MAX_FEHLER = 50;
  protected circuitStatus: AgentStatus = "aktiv";

  constructor(name: string, typ: string) {
    this.agentName = name;
    this.agentTyp = typ;
  }

  async initialisieren(): Promise<void> {
    const [vorhandener] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.typ, this.agentTyp))
      .limit(1);

    if (vorhandener) {
      this.agentId = vorhandener.id;
    } else {
      const [neu] = await db
        .insert(agentsTable)
        .values({
          name: this.agentName,
          typ: this.agentTyp,
          beschreibung: this.beschreibungText(),
          status: "wartend",
          fehlerAnzahl: 0,
          ausgefuehrtAufgaben: 0,
        })
        .returning();
      this.agentId = neu?.id ?? null;
    }
    logger.info({ agentName: this.agentName, agentId: this.agentId }, "Agent initialisiert");
  }

  protected abstract beschreibungText(): string;

  abstract ausfuehren(aufgabe: Aufgabe): Promise<AufgabeErgebnis>;

  protected async setzeStatus(status: AgentStatus): Promise<void> {
    if (!this.agentId) return;
    await db
      .update(agentsTable)
      .set({ status, letzteAktivitaet: new Date(), updatedAt: new Date() })
      .where(eq(agentsTable.id, this.agentId));
  }

  protected async protokolliere(
    aktion: string,
    status: "erfolgreich" | "fehler" | "gestartet",
    nachricht: string,
    metadaten?: Record<string, unknown>,
    dauer?: number,
  ): Promise<void> {
    if (!this.agentId) return;
    await db.insert(agentLogsTable).values({
      agentId: this.agentId,
      agentName: this.agentName,
      aktion,
      status,
      nachricht,
      metadaten: metadaten ? JSON.stringify(metadaten) : null,
      dauer: dauer ?? null,
    });
  }

  async fuehreAufgabeAus(aufgabe: Aufgabe): Promise<AufgabeErgebnis> {
    if (!this.agentId) throw new Error(`Agent ${this.agentName} nicht initialisiert`);

    // SPRING 63: LLM-Kontext setzen → Retry/Token-Accounting läuft mit dem
    // korrekten agentName in token_logs (zentral im openaiClient gewrappt).
    setzeLLMKontext(this.agentName);

    this.laufend = true;
    const startzeit = Date.now();

    await this.setzeStatus("aktiv");
    await this.protokolliere(
      `Aufgabe gestartet: ${aufgabe.typ}`,
      "gestartet",
      `Versuch ${aufgabe.versuche + 1}/${aufgabe.maxVersuche}`,
      { aufgabeId: aufgabe.id, payload: aufgabe.payload },
    );

    try {
      const ergebnis = await this.ausfuehren(aufgabe);
      const dauer = Date.now() - startzeit;

      await db
        .update(agentsTable)
        .set({
          ausgefuehrtAufgaben: sql`ausgefuehrt_aufgaben + 1`,
          letzteAktivitaet: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agentsTable.id, this.agentId));

      await this.protokolliere(
        `Aufgabe abgeschlossen: ${aufgabe.typ}`,
        "erfolgreich",
        ergebnis.message,
        ergebnis.metadaten,
        dauer,
      );

      await this.setzeStatus("wartend");
      this.laufend = false;
      return { ...ergebnis, dauer };
    } catch (err) {
      const dauer = Date.now() - startzeit;
      const fehlerMsg = err instanceof Error ? err.message : "Unbekannter Fehler";

      // Circuit Breaker: Fehler zählen, ggf. Agent pausieren
      this.handleFehler(err);

      await db
        .update(agentsTable)
        .set({
          fehlerAnzahl: sql`fehler_anzahl + 1`,
          updatedAt: new Date(),
        })
        .where(eq(agentsTable.id, this.agentId));

      await this.protokolliere(
        `Aufgabe fehlgeschlagen: ${aufgabe.typ}`,
        "fehler",
        fehlerMsg,
        { fehler: fehlerMsg, versuch: aufgabe.versuche + 1, circuitStatus: this.circuitStatus },
        dauer,
      );

      // Status nur auf "fehler" setzen wenn Circuit nicht bereits auf "pausiert" steht
      if (this.circuitStatus !== "pausiert") {
        await this.setzeStatus("fehler");
      }
      this.laufend = false;
      throw err;
    }
  }

  /**
   * Circuit Breaker: Fehler zählen und Agent bei Bedarf pausieren.
   * Bei 401/Unauthorized → sofort pausieren (kein Key mehr nötig zu testen).
   * Bei MAX_FEHLER Überschreitung → automatisch pausieren.
   */
  protected handleFehler(err: unknown): void {
    this.fehlerZaehler++;
    const msg = err instanceof Error ? err.message : String(err);
    const ist401 =
      msg.includes("401") ||
      msg.toLowerCase().includes("unauthorized") ||
      msg.toLowerCase().includes("invalid_api_key");

    if (ist401) {
      this.circuitStatus = "pausiert";
      logger.error(
        { agentName: this.agentName, fehlerZaehler: this.fehlerZaehler },
        `[KRITISCH] API-Key-Fehler bei ${this.agentName} — Agent sofort pausiert`,
      );
      void this.setzeStatus("pausiert");
      return;
    }

    logger.warn(
      { agentName: this.agentName, fehlerZaehler: this.fehlerZaehler, maxFehler: this.MAX_FEHLER },
      `[ALARM] ${this.agentName} — Fehler ${this.fehlerZaehler}/${this.MAX_FEHLER}: ${msg}`,
    );

    if (this.fehlerZaehler >= this.MAX_FEHLER) {
      this.circuitStatus = "pausiert";
      logger.error(
        { agentName: this.agentName },
        `[KRITISCH] ${this.agentName} hat Fehlerlimit (${this.MAX_FEHLER}) erreicht — automatisch pausiert`,
      );
      void this.setzeStatus("pausiert");
    }
  }

  /**
   * Circuit Breaker zurücksetzen — nach Key-Reparatur oder manuell.
   */
  public resetAgent(): void {
    this.fehlerZaehler = 0;
    this.circuitStatus = "aktiv";
    logger.info({ agentName: this.agentName }, `[INFO] Agent ${this.agentName} wurde manuell zurückgesetzt`);
    void this.setzeStatus("wartend");
  }

  berechneBackoffMs(versuch: number): number {
    const faktor = RETRY_BACKOFF_FAKTOREN[Math.min(versuch, RETRY_BACKOFF_FAKTOREN.length - 1)] ?? 16;
    const jitter = Math.random() * 1000;
    return faktor * 1000 + jitter;
  }

  istLaufend(): boolean {
    return this.laufend;
  }

  holeAgentId(): number | null {
    return this.agentId;
  }
}
