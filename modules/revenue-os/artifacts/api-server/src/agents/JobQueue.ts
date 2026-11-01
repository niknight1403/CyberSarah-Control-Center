import { EventEmitter } from "events";
import { logger } from "../lib/logger";
import type { Aufgabe, AufgabeErgebnis } from "./AgentBase";

export type JobStatus = "wartend" | "laufend" | "abgeschlossen" | "fehlgeschlagen" | "wiederholt";

export interface Job {
  aufgabe: Aufgabe;
  status: JobStatus;
  ergebnis?: AufgabeErgebnis;
  fehler?: string;
  gestartetAm?: Date;
  abgeschlossenAm?: Date;
}

interface AufgabenHandler {
  (aufgabe: Aufgabe): Promise<AufgabeErgebnis>;
}

let aufgabenZaehler = 0;

function neueAufgabeId(): string {
  return `aufgabe-${Date.now()}-${++aufgabenZaehler}`;
}

export class JobQueue extends EventEmitter {
  private queue: Map<string, Job> = new Map();
  private handler: Map<string, AufgabenHandler> = new Map();
  private gleichzeitigLaufend = 0;
  private readonly maxGleichzeitig: number;
  private verarbeitungsSchleife: NodeJS.Timeout | null = null;

  constructor(maxGleichzeitig = 3) {
    super();
    this.maxGleichzeitig = maxGleichzeitig;
  }

  registriereHandler(aufgabenTyp: string, handler: AufgabenHandler): void {
    this.handler.set(aufgabenTyp, handler);
  }

  fuegeHinzu(
    aufgabenTyp: string,
    payload: Record<string, unknown>,
    optionen: {
      prioritaet?: 1 | 2 | 3;
      maxVersuche?: number;
      faelligAb?: Date;
    } = {},
  ): string {
    const id = neueAufgabeId();
    const aufgabe: Aufgabe = {
      id,
      typ: aufgabenTyp,
      payload,
      prioritaet: optionen.prioritaet ?? 2,
      versuche: 0,
      maxVersuche: optionen.maxVersuche ?? 3,
      erstelltAm: new Date(),
      faelligAb: optionen.faelligAb,
    };

    this.queue.set(id, { aufgabe, status: "wartend" });
    logger.info({ aufgabeId: id, typ: aufgabenTyp, prioritaet: aufgabe.prioritaet }, "Job zur Queue hinzugefügt");
    this.emit("job:hinzugefuegt", aufgabe);
    this.verarbeite();
    return id;
  }

  private naechsteAufgabe(): Job | undefined {
    const jetzt = new Date();
    return [...this.queue.values()]
      .filter(j => {
        if (j.status !== "wartend" && j.status !== "wiederholt") return false;
        if (j.aufgabe.faelligAb && j.aufgabe.faelligAb > jetzt) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.aufgabe.prioritaet !== b.aufgabe.prioritaet) {
          return a.aufgabe.prioritaet - b.aufgabe.prioritaet;
        }
        return a.aufgabe.erstelltAm.getTime() - b.aufgabe.erstelltAm.getTime();
      })[0];
  }

  private async verarbeite(): Promise<void> {
    if (this.gleichzeitigLaufend >= this.maxGleichzeitig) return;

    const job = this.naechsteAufgabe();
    if (!job) return;

    const handler = this.handler.get(job.aufgabe.typ);
    if (!handler) {
      logger.warn({ typ: job.aufgabe.typ }, "Kein Handler für Aufgabentyp registriert");
      job.status = "fehlgeschlagen";
      job.fehler = `Kein Handler für Typ: ${job.aufgabe.typ}`;
      return;
    }

    this.gleichzeitigLaufend++;
    job.status = "laufend";
    job.gestartetAm = new Date();
    this.emit("job:gestartet", job.aufgabe);

    try {
      const ergebnis = await handler(job.aufgabe);
      job.status = "abgeschlossen";
      job.ergebnis = ergebnis;
      job.abgeschlossenAm = new Date();
      this.emit("job:abgeschlossen", job.aufgabe, ergebnis);
      logger.info({ aufgabeId: job.aufgabe.id, typ: job.aufgabe.typ }, "Job erfolgreich abgeschlossen");
    } catch (err) {
      const fehlerMsg = err instanceof Error ? err.message : "Unbekannter Fehler";
      job.aufgabe.versuche++;

      if (job.aufgabe.versuche < job.aufgabe.maxVersuche) {
        const wartezeitMs = this.berechneBackoff(job.aufgabe.versuche);
        job.status = "wiederholt";
        job.fehler = fehlerMsg;
        job.aufgabe.faelligAb = new Date(Date.now() + wartezeitMs);
        this.emit("job:wiederholt", job.aufgabe, job.aufgabe.versuche, wartezeitMs);
        logger.warn(
          { aufgabeId: job.aufgabe.id, versuch: job.aufgabe.versuche, wartezeitMs },
          `Job wird in ${wartezeitMs}ms wiederholt`,
        );
      } else {
        job.status = "fehlgeschlagen";
        job.fehler = fehlerMsg;
        job.abgeschlossenAm = new Date();
        this.emit("job:fehlgeschlagen", job.aufgabe, fehlerMsg);
        logger.error(
          { aufgabeId: job.aufgabe.id, typ: job.aufgabe.typ, fehler: fehlerMsg },
          "Job endgültig fehlgeschlagen",
        );
      }
    } finally {
      this.gleichzeitigLaufend--;
      this.verarbeite();
    }
  }

  private berechneBackoff(versuch: number): number {
    const basis = Math.pow(2, versuch) * 1000;
    const jitter = Math.random() * 1000;
    return Math.min(basis + jitter, 60_000);
  }

  starteVerarbeitungsschleife(intervallMs = 5000): void {
    this.verarbeitungsSchleife = setInterval(() => {
      this.verarbeite();
    }, intervallMs);
    logger.info({ intervallMs }, "Job-Queue Verarbeitungsschleife gestartet");
  }

  stoppeVerarbeitungsschleife(): void {
  if (this.verarbeitungsSchleife) {
      clearInterval(this.verarbeitungsSchleife);
      this.verarbeitungsSchleife = null;
    }
  }

  holeStatus(): {
    gesamt: number;
    wartend: number;
    laufend: number;
    abgeschlossen: number;
    fehlgeschlagen: number;
    wiederholt: number;
  } {
    const jobs = [...this.queue.values()];
    return {
      gesamt: jobs.length,
      wartend: jobs.filter(j => j.status === "wartend").length,
      laufend: jobs.filter(j => j.status === "laufend").length,
      abgeschlossen: jobs.filter(j => j.status === "abgeschlossen").length,
      fehlgeschlagen: jobs.filter(j => j.status === "fehlgeschlagen").length,
      wiederholt: jobs.filter(j => j.status === "wiederholt").length,
    };
  }

  bereinige(aelterAlsMs = 3_600_000): void {
    const grenze = new Date(Date.now() - aelterAlsMs);
    for (const [id, job] of this.queue.entries()) {
      if (
        (job.status === "abgeschlossen" || job.status === "fehlgeschlagen") &&
        job.abgeschlossenAm &&
        job.abgeschlossenAm < grenze
      ) {
        this.queue.delete(id);
      }
    }
  }
}

export const globalQueue = new JobQueue(3);
