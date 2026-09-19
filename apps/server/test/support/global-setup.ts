import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import EmbeddedPostgres from 'embedded-postgres';
import type { TestProject } from 'vitest/node';
import { MIGRATIONS_FOLDER } from './migrations.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Starts a throwaway Postgres for this e2e run, applies every migration and
 * hands its URL to the tests. The cluster and its files are removed afterwards.
 */
export default async function setup(project: TestProject) {
  const dataDir = await mkdtemp(join(tmpdir(), 'runout-e2e-pg-'));
  const port = await freePort();
  const postgres = new EmbeddedPostgres({
    databaseDir: dataDir,
    port,
    user: 'runout',
    password: 'runout',
    persistent: false,
    onLog: () => {},
  });

  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('runout');
  const databaseUrl = `postgres://runout:runout@127.0.0.1:${port}/runout`;

  const db = drizzle(databaseUrl);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await db.$client.end();

  project.provide('databaseUrl', databaseUrl);

  return async () => {
    await postgres.stop();
    await rm(dataDir, { recursive: true, force: true });
  };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}
