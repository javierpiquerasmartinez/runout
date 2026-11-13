import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { inject } from 'vitest';
import { CLOCK } from '../../src/clock/clock.js';
import { DATABASE_URL } from '../../src/database/database.js';
import { WAKE_SECRET } from '../../src/import-service/import-service-config.js';
import { ImportEngine } from '../../src/import-service/import-engine.js';
import {
  configureImportService,
  ImportServiceModule,
} from '../../src/import-service/import-service.module.js';
import { TestClock } from './test-clock.js';

export interface RunningImportService {
  app: INestApplication;
  httpServer: Server;
  /** `host:port`, as the API's `IMPORT_SERVICE_ADDRESS` names it. */
  address: string;
  /** How many wakes have set the engine working. */
  wakes(): number;
  close(): Promise<void>;
}

export interface StartImportServiceOptions {
  /** What a wake must carry, as `IMPORT_SERVICE_SECRET` sets it. */
  secret: string;
  /** Defaults to the Postgres started for this e2e run. */
  databaseUrl?: string;
  clock?: TestClock;
}

/** The engine as the service runs it, counting the times it is set working. */
class CountedImportEngine extends ImportEngine {
  started = 0;

  override workUntilNothingLeft(): Promise<void> {
    this.started++;
    return super.workUntilNothingLeft();
  }
}

/** Boots the import service in-process on a random port, wired like production. */
export async function startImportService(
  options: StartImportServiceOptions,
): Promise<RunningImportService> {
  const engine = new CountedImportEngine();
  const moduleRef = await Test.createTestingModule({
    imports: [ImportServiceModule],
  })
    .overrideProvider(DATABASE_URL)
    .useValue(options.databaseUrl ?? inject('databaseUrl'))
    .overrideProvider(CLOCK)
    .useValue(options.clock ?? new TestClock())
    .overrideProvider(WAKE_SECRET)
    .useValue(options.secret)
    .overrideProvider(ImportEngine)
    .useValue(engine)
    .compile();

  const app = moduleRef.createNestApplication();
  configureImportService(app);
  await app.listen(0, '127.0.0.1');

  const httpServer = app.getHttpServer() as Server;
  const { port } = httpServer.address() as AddressInfo;
  let closed = false;
  return {
    app,
    httpServer,
    address: `127.0.0.1:${port}`,
    wakes: () => engine.started,
    close: async () => {
      if (closed) return;
      closed = true;
      await app.close();
    },
  };
}
