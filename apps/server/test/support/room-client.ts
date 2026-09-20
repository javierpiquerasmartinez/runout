import { WebSocket, type RawData } from 'ws';

export interface Message<T = any> {
  event: string;
  data: T;
  /** The revision a change to the Room's shared state produced, when it is one. */
  revision?: number;
}

/**
 * A real WebSocket client for e2e tests. It keeps every message it receives so
 * a test can wait for one that arrived before it started waiting.
 */
export class RoomClient {
  private readonly received: Message[] = [];
  private readonly waiters: (() => void)[] = [];

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (raw: RawData) => {
      this.received.push(
        JSON.parse(Buffer.from(raw as Buffer).toString('utf8')) as Message,
      );
      this.waiters.splice(0).forEach((wake) => wake());
    });
  }

  /** Opens `/ws`, presenting the identity token when given. */
  static async connect(wsUrl: string, token?: string): Promise<RoomClient> {
    const url = token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl;
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return new RoomClient(socket);
  }

  send(event: string, data: unknown = {}): void {
    this.socket.send(JSON.stringify({ event, data }));
  }

  /**
   * Resolves with the first not-yet-consumed message of `event` that matches,
   * consuming it. Fails after `timeoutMs`.
   */
  async next<T = any>(
    event: string,
    matches: (data: T) => boolean = () => true,
    timeoutMs = 2_000,
  ): Promise<T> {
    return (await this.nextMessage<T>(event, matches, timeoutMs)).data;
  }

  /** The same, envelope and all, for a test that reads a message's revision. */
  async nextMessage<T = any>(
    event: string,
    matches: (data: T) => boolean = () => true,
    timeoutMs = 2_000,
  ): Promise<Message<T>> {
    const index = await this.waitFor(event, matches, timeoutMs);
    return this.received.splice(index, 1)[0] as Message<T>;
  }

  /**
   * Waits for a matching message of `event` without consuming it, for a test
   * that then reads the whole run of messages as it arrived.
   */
  async until<T = any>(
    event: string,
    matches: (data: T) => boolean = () => true,
    timeoutMs = 2_000,
  ): Promise<void> {
    await this.waitFor(event, matches, timeoutMs);
  }

  /** Asserts helper: every message received so far, in order, without consuming. */
  messages(): Message[] {
    return [...this.received];
  }

  /** Asserts helper: every message of `event` received so far, without consuming. */
  all<T = any>(event: string): T[] {
    return this.received
      .filter((message) => message.event === event)
      .map((message) => message.data as T);
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      this.socket.once('close', () => resolve());
      this.socket.close();
    });
  }

  /** The position of the first matching message, waiting for one to arrive. */
  private async waitFor<T>(
    event: string,
    matches: (data: T) => boolean,
    timeoutMs: number,
  ): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = this.received.findIndex(
        (message) => message.event === event && matches(message.data as T),
      );
      if (index !== -1) return index;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `No "${event}" within ${timeoutMs} ms. Received: ${JSON.stringify(this.received)}`,
        );
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, remaining);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
}
