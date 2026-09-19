import request from 'supertest';
import { WebSocket, type RawData } from 'ws';
import { startApp, type RunningApp } from './support/app.js';

describe('Runout server (e2e)', () => {
  let running: RunningApp;

  beforeEach(async () => {
    running = await startApp();
  });

  afterEach(async () => {
    await running.close();
  });

  it('GET /api/health reports the server and database as up', () => {
    return request(running.httpServer)
      .get('/api/health')
      .expect(200)
      .expect((res) =>
        expect(res.body).toMatchObject({ status: 'ok', database: 'reachable' }),
      );
  });

  it('GET /api/health reports the server time from the injected clock', async () => {
    await running.clock.advance(60_000);
    const expected = running.clock.now().toISOString();

    const res = await request(running.httpServer)
      .get('/api/health')
      .expect(200);

    expect(res.body.serverTime).toBe(expected);
  });

  it('answers ping with pong over /ws', async () => {
    const socket = new WebSocket(running.wsUrl);

    const reply = await new Promise<{
      event: string;
      data: { sentAt: number };
    }>((resolve, reject) => {
      socket.on('open', () =>
        socket.send(JSON.stringify({ event: 'ping', data: { sentAt: 42 } })),
      );
      socket.on('message', (raw: RawData) =>
        resolve(JSON.parse(Buffer.from(raw as Buffer).toString('utf8'))),
      );
      socket.on('error', reject);
    });
    socket.close();

    expect(reply).toMatchObject({ event: 'pong', data: { sentAt: 42 } });
  });
});

describe('Runout server without a database (e2e)', () => {
  it('stays up and answers health with 503, reporting the database as unreachable', async () => {
    // Nothing listens on port 1, so every connection attempt is refused.
    const running = await startApp({
      databaseUrl: 'postgres://runout:runout@127.0.0.1:1/runout',
    });
    try {
      const res = await request(running.httpServer)
        .get('/api/health')
        .expect(503);

      expect(res.body).toMatchObject({
        status: 'unavailable',
        database: 'unreachable',
      });
    } finally {
      await running.close();
    }
  });
});
