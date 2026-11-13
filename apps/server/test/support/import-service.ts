import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { inject } from 'vitest';
import { CLOCK } from '../../src/clock/clock.js';
import { DATABASE_URL } from '../../src/database/database.js';
import { FILE_STORE, type FileStore } from '../../src/file-store/file-store.js';
import {
  BULK_IMPORT_LIMIT,
  DEFAULT_BULK_IMPORT_LIMIT,
} from '../../src/import-service/bulk-import-limit.js';
import {
  DEFAULT_LIBRARY_CAPACITY,
  LIBRARY_CAPACITY,
} from '../../src/library/library-limits.js';
import { WAKE_SECRET } from '../../src/import-service/import-service-config.js';
import { ImportEngine } from '../../src/import-service/import-engine.js';
import {
  configureImportService,
  ImportServiceModule,
} from '../../src/import-service/import-service.module.js';
import { MemoryFileStore } from './memory-file-store.js';
import { TestClock } from './test-clock.js';

export interface RunningImportService {
  app: INestApplication;
  httpServer: Server;
  /** `host:port`, as the API's `IMPORT_SERVICE_ADDRESS` names it. */
  address: string;
  /** How many wakes have set the engine working since it started. */
  wakes(): number;
  /** Resolves once the engine has nothing left in hand. */
  settled(): Promise<void>;
  close(): Promise<void>;
}

export interface StartImportServiceOptions {
  /** What a wake must carry, as `IMPORT_SERVICE_SECRET` sets it. */
  secret: string;
  /** Defaults to the Postgres started for this e2e run. */
  databaseUrl?: string;
  clock?: TestClock;
  /** Shared with the API that takes the uploads; an empty one otherwise. */
  fileStore?: FileStore;
  /** The most Hands one Bulk Import may hold; 2 million otherwise, as in production. */
  limit?: number;
  /** The most Hands a Library may hold; 10 million otherwise, as in production. */
  libraryCapacity?: number;
}

/** Boots the import service in-process on a random port, wired like production. */
export async function startImportService(
  options: StartImportServiceOptions,
): Promise<RunningImportService> {
  const moduleRef = await Test.createTestingModule({
    imports: [ImportServiceModule],
  })
    .overrideProvider(DATABASE_URL)
    .useValue(options.databaseUrl ?? inject('databaseUrl'))
    .overrideProvider(CLOCK)
    .useValue(options.clock ?? new TestClock())
    .overrideProvider(WAKE_SECRET)
    .useValue(options.secret)
    .overrideProvider(FILE_STORE)
    .useValue(options.fileStore ?? new MemoryFileStore())
    .overrideProvider(BULK_IMPORT_LIMIT)
    .useValue(options.limit ?? DEFAULT_BULK_IMPORT_LIMIT)
    .overrideProvider(LIBRARY_CAPACITY)
    .useValue(options.libraryCapacity ?? DEFAULT_LIBRARY_CAPACITY)
    .compile();

  const app = moduleRef.createNestApplication();
  configureImportService(app);
  // What start-up set going is not a wake: count from here.
  const engine = app.get(ImportEngine);
  let wakes = 0;
  const work = engine.workUntilNothingLeft.bind(engine);
  await app.listen(0, '127.0.0.1');
  engine.workUntilNothingLeft = () => {
    wakes++;
    return work();
  };

  const httpServer = app.getHttpServer() as Server;
  const { port } = httpServer.address() as AddressInfo;
  let closed = false;
  return {
    app,
    httpServer,
    address: `127.0.0.1:${port}`,
    wakes: () => wakes,
    settled: () => engine.settled(),
    close: async () => {
      if (closed) return;
      closed = true;
      // As a restart would: the batch in hand commits, and no other begins.
      await app.close();
    },
  };
}
