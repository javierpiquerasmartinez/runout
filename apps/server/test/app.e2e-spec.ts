import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import request from 'supertest';
import { App } from 'supertest/types';
import { WebSocket, type RawData } from 'ws';
import { AddressInfo } from 'node:net';
import { AppModule } from './../src/app.module.js';

describe('Runout server (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useWebSocketAdapter(new WsAdapter(app));
    await app.listen(0);
  });

  it('GET /api/health', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => expect(res.body.status).toBe('ok'));
  });

  it('answers ping with pong over /ws', async () => {
    const { port } = app.getHttpServer().address() as AddressInfo;
    const socket = new WebSocket(`ws://localhost:${port}/ws`);

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

  afterEach(async () => {
    await app.close();
  });
});
