declare module 'ws' {
  import type { EventEmitter } from 'node:events';
  import type { IncomingMessage } from 'node:http';
  import type { Duplex } from 'node:stream';

  export type RawData = Buffer | ArrayBuffer | Buffer[];

  export class WebSocket extends EventEmitter {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly readyState: number;
    send(data: string | Buffer | ArrayBufferView, cb?: (err?: Error) => void): void;
    close(code?: number, data?: string | Buffer): void;
    terminate(): void;
    ping(data?: unknown, mask?: boolean, cb?: (err: Error) => void): void;

    on(event: 'message', listener: (data: RawData, isBinary: boolean) => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: string | symbol, listener: (...args: unknown[]) => void): this;
  }

  export interface WebSocketServerOptions {
    noServer?: boolean;
    path?: string;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: WebSocketServerOptions);
    handleUpgrade(
      req: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (client: WebSocket, request: IncomingMessage) => void
    ): void;
    close(cb?: (err?: Error) => void): void;
    on(event: 'connection', listener: (ws: WebSocket, req: IncomingMessage) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string | symbol, listener: (...args: unknown[]) => void): this;
  }

  export default WebSocket;
}
