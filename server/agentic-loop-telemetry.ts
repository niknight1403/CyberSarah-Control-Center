/**
 * Sprint 353 — Telemetrie-Bus: Session-isolierte Broadcasts.
 * Ein Bus-Objekt verwaltet pro Session-ID einen Ring-Puffer (Replay nach
 * Reconnect via Last-Event-ID) und eine Menge Abonnenten. Verbindungssicherheit:
 *  - Werfen Abonnenten-Fehler, wird der Abonnent isoliert entfernt —
 *    ein toter Stream stoppt nie den Loop und die anderen Abonnenten.
 *  - subscribeWithReplay ist atomar (single-threaded JS): Erst abonnieren,
 *    dann Puffer nachliefern — keine Luecke, kein Duplikat.
 */
import {
  isValidLoopSessionId,
  replayLoopEvents,
  type AgenticLoopEvent,
} from "../lib/agentic-loop-telemetry-logic";

export type LoopEventHandler = (event: AgenticLoopEvent) => void;

const BUFFER_LIMIT_PER_SESSION = 240;

type SessionChannel = {
  events: AgenticLoopEvent[];
  subscribers: Set<LoopEventHandler>;
  nextEventId: number;
};

export class AgenticLoopTelemetryBus {
  private readonly channels = new Map<string, SessionChannel>();

  private channel(sessionId: string): SessionChannel {
    let channel = this.channels.get(sessionId);
    if (!channel) {
      channel = { events: [], subscribers: new Set(), nextEventId: 1 };
      this.channels.set(sessionId, channel);
    }
    return channel;
  }

  /** Session-IDs werden validiert, bevor ein Kanal angelegt wird. */
  emit(sessionId: string, draft: Omit<AgenticLoopEvent, "id">): AgenticLoopEvent | null {
    if (!isValidLoopSessionId(sessionId)) return null;
    const channel = this.channel(sessionId);
    const event: AgenticLoopEvent = { ...draft, id: channel.nextEventId++ };
    channel.events.push(event);
    if (channel.events.length > BUFFER_LIMIT_PER_SESSION) channel.events.shift();
    for (const handler of [...channel.subscribers]) {
      try {
        handler(event);
      } catch {
        // Verbindungssicherheit: kaputter Handler wird rausgeworfen,
        // der Broadcast laeuft fuer alle anderen weiter.
        channel.subscribers.delete(handler);
      }
    }
    return event;
  }

  /** Live-Abo ohne Replay. Rueckgabe: Abmelde-Funktion. */
  subscribe(sessionId: string, handler: LoopEventHandler): () => void {
    if (!isValidLoopSessionId(sessionId)) return () => undefined;
    const channel = this.channel(sessionId);
    channel.subscribers.add(handler);
    return () => channel.subscribers.delete(handler);
  }

  /** Atomar: Live-Abo schalten, dann verpasste Events nachliefern. */
  subscribeWithReplay(sessionId: string, handler: LoopEventHandler, sinceEventId: number): { unsubscribe: () => void; replayed: AgenticLoopEvent[] } {
    const unsubscribe = this.subscribe(sessionId, handler);
    const replayed = replayLoopEvents(this.buffer(sessionId), sinceEventId);
    for (const event of replayed) {
      try {
        handler(event);
      } catch {
        unsubscribe();
        return { unsubscribe: () => undefined, replayed: [] };
      }
    }
    return { unsubscribe, replayed };
  }

  buffer(sessionId: string): AgenticLoopEvent[] {
    return this.channels.get(sessionId)?.events ?? [];
  }

  subscriberCount(sessionId: string): number {
    return this.channels.get(sessionId)?.subscribers.size ?? 0;
  }

  /** Aufräumen, wenn eine Session endet (Verbindungs-Hygiene). */
  dispose(sessionId: string): void {
    this.channels.delete(sessionId);
  }
}

/** Prozessweiter Standard-Bus (kann in Tests isoliert ersetzt werden). */
export const agenticLoopTelemetryBus = new AgenticLoopTelemetryBus();
