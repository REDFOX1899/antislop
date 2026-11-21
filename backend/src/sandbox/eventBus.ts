import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import type { StreamEvent, StreamEventType } from '../../../shared/types.js';

const MAX_RETAINED_RUNS = 100;
const MAX_EVENTS_PER_RUN = 500;
const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_SSE_CONNECTION_MS = 20 * 60 * 1000;

export class RunEventBus {
  private readonly emitters = new Map<string, EventEmitter>();
  private readonly history = new Map<string, StreamEvent[]>();
  private readonly runOrder: string[] = [];

  private ensureRun(runId: string): { emitter: EventEmitter; events: StreamEvent[] } {
    let emitter = this.emitters.get(runId);
    let events = this.history.get(runId);

    if (!emitter || !events) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(50);
      events = [];
      this.emitters.set(runId, emitter);
      this.history.set(runId, events);
      this.runOrder.push(runId);
      this.pruneOldRuns();
    }

    return { emitter, events };
  }

  private pruneOldRuns(): void {
    while (this.runOrder.length > MAX_RETAINED_RUNS) {
      const oldestRunId = this.runOrder.shift();
      if (!oldestRunId) continue;
      const emitter = this.emitters.get(oldestRunId);
      if (emitter) {
        emitter.removeAllListeners();
        this.emitters.delete(oldestRunId);
      }
      this.history.delete(oldestRunId);
    }
  }

  emitEvent(event: StreamEvent): void {
    const { emitter, events } = this.ensureRun(event.runId);
    events.push(event);
    if (events.length > MAX_EVENTS_PER_RUN) {
      events.splice(0, events.length - MAX_EVENTS_PER_RUN);
    }
    emitter.emit('event', event);
  }

  emit(
    runId: string,
    type: StreamEventType,
    message: string,
    options?: {
      iteration?: number;
      model?: string;
      payload?: unknown;
    }
  ): StreamEvent {
    const event: StreamEvent = {
      runId,
      type,
      timestamp: new Date().toISOString(),
      ...(options?.iteration !== undefined ? { iteration: options.iteration } : {}),
      ...(options?.model !== undefined ? { model: options.model } : {}),
      message,
      ...(options?.payload !== undefined ? { payload: options.payload } : {}),
    };
    this.emitEvent(event);
    return event;
  }

  getHistory(runId: string): StreamEvent[] {
    return [...(this.history.get(runId) ?? [])];
  }

  subscribe(runId: string, listener: (event: StreamEvent) => void): () => void {
    const { emitter } = this.ensureRun(runId);
    emitter.on('event', listener);
    return () => {
      emitter.off('event', listener);
    };
  }

  attachSseStream(runId: string, req: Request, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.status(200);
    res.flushHeaders?.();

    // Inform EventSource clients to wait briefly before auto-reconnect if dropped
    res.write('retry: 5000\n\n');

    let seq = 0;
    const writeEvent = (event: StreamEvent): void => {
      if (res.writableEnded || res.destroyed) return;
      seq += 1;
      try {
        // Send unnamed data frames so EventSource.onmessage receives 100% of StreamEvents
        res.write(`id: ${seq}\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Client likely disconnected mid-write
      }
    };

    // Snapshot existing buffered events BEFORE subscribing so zero events are lost or duplicated
    const existing = this.getHistory(runId);
    for (const ev of existing) {
      writeEvent(ev);
    }

    const unsubscribe = this.subscribe(runId, (ev) => {
      writeEvent(ev);
    });

    const heartbeat = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        cleanup();
        return;
      }
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        cleanup();
      }
    }, HEARTBEAT_INTERVAL_MS);

    const maxLifetimeTimer = setTimeout(() => {
      cleanup();
      if (!res.writableEnded) {
        res.end();
      }
    }, MAX_SSE_CONNECTION_MS);

    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeat);
      clearTimeout(maxLifetimeTimer);
      unsubscribe();
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
    res.on('close', cleanup);
  }
}

export const eventBus = new RunEventBus();
