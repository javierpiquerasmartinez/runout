import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { CLOCK } from '../../src/clock/clock.js';
import { DATABASE_URL } from '../../src/database/database.js';
import { GOOGLE_VERIFIER } from '../../src/identity/google-verifier.js';
import {
  ADMINISTRATOR_EMAILS,
  AdministratorEmails,
} from '../../src/identity/administrators.js';
import { MAILER } from '../../src/mail/mailer.js';
import { LIBRARY_CAPACITY } from '../../src/library/library-limits.js';
import { PlaybackService } from '../../src/rooms/playback.service.js';
import { FakeGoogleVerifier } from './google.js';
import { FakeInbox } from './inbox.js';
import { freshDatabase } from './fresh-database.js';
import { TestClock } from './test-clock.js';

export interface RunningApp {
  app: INestApplication;
  httpServer: Server;
  /** WebSocket endpoint of this app instance. */
  wsUrl: string;
  /** The app's clock; advance it to trigger time-based rules. */
  clock: TestClock;
  /** The database it runs on, for a second app to start on, as a restart would. */
  databaseUrl: string;
  /** Every email the app has sent. */
  inbox: FakeInbox;
  close(): Promise<void>;
}

export interface StartAppOptions {
  clock?: TestClock;
  /**
   * Defaults to the Postgres started for this e2e run. Another one is taken
   * as Runout restarting on it: its Live Rooms are taken on at boot.
   */
  databaseUrl?: string;
  /**
   * A migrated database of its own, dropped on close. For a test that moves
   * the clock 14 days or more: the Room sweep would close every other file's
   * Rooms in the shared one. It also takes on the Live Rooms it finds there
   * on boot, as a restart does.
   */
  ownDatabase?: boolean;
  /** The emails of the Administrators, as `ADMINISTRATOR_EMAILS` would list them. */
  administratorEmails?: string[];
  /** How many Hands a Library may hold; 10 million otherwise, as in production. */
  libraryCapacity?: number;
}

/**
 * An app on the shared database finds every other file's Live Rooms there,
 * their Masters connected to apps of their own. Taking them on as a restart
 * does would end their Live once its clock moves 30 minutes, under the test
 * still using them: it leaves them to their own app instead.
 */
class SharedDatabasePlayback extends PlaybackService {
  override liveRooms(): ReturnType<PlaybackService['liveRooms']> {
    return Promise.resolve([]);
  }
}

/**
 * Boots the real app on a random port, wired exactly like production, but
 * for the Live Rooms it finds on boot when on the shared database.
 */
export async function startApp(
  options: StartAppOptions = {},
): Promise<RunningApp> {
  const own = options.ownDatabase ? await freshDatabase() : null;
  const databaseUrl = own?.url ?? options.databaseUrl ?? inject('databaseUrl');
  const clock = options.clock ?? new TestClock();
  const inbox = new FakeInbox();
  const builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DATABASE_URL)
    .useValue(databaseUrl)
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(GOOGLE_VERIFIER)
    .useValue(new FakeGoogleVerifier())
    .overrideProvider(MAILER)
    .useValue(inbox)
    .overrideProvider(ADMINISTRATOR_EMAILS)
    .useValue(new AdministratorEmails(options.administratorEmails ?? []));
  if (options.libraryCapacity !== undefined) {
    builder
      .overrideProvider(LIBRARY_CAPACITY)
      .useValue(options.libraryCapacity);
  }
  if (databaseUrl === inject('databaseUrl')) {
    builder.overrideProvider(PlaybackService).useClass(SharedDatabasePlayback);
  }
  const moduleRef = await builder.compile();

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
    databaseUrl,
    inbox,
    close: async () => {
      await app.close();
      await own?.drop();
    },
  };
}
