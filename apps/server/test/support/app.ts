import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { CLOCK } from '../../src/clock/clock.js';
import { DATABASE_URL } from '../../src/database/database.js';
import { TestClock } from './test-clock.js';

export interface RunningApp {
  app: INestApplication;
  httpServer: Server;
  /** WebSocket endpoint of this app instance. */
  wsUrl: string;
  /** The app's clock; advance it to trigger time-based rules. */
  clock: TestClock;
  close(): Promise<void>;
}

export interface StartAppOptions {
  clock?: TestClock;
  /** Defaults to the Postgres started for this e2e run. */
  databaseUrl?: string;
}

/** Boots the real app on a random port, wired exactly like production. */
export async function startApp(
  options: StartAppOptions = {},
): Promise<RunningApp> {
  const clock = options.clock ?? new TestClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DATABASE_URL)
    .useValue(options.databaseUrl ?? inject('databaseUrl'))
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.listen(0, '127.0.0.1');

  const httpServer = app.getHttpServer() as Server;
  const { port } = httpServer.address() as AddressInfo;
  return {
    app,
    httpServer,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    clock,
    close: () => app.close(),
  };
}
