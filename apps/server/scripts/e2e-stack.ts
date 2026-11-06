// The server for the web's browser tests (apps/web/e2e): a throwaway Postgres
// with every migration applied, and the built server on top of it in Test mode,
// so the tests sign in as Tester A and seed their own Hands without touching
// your local data. Run it after `pnpm build`; Playwright starts and stops it.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import EmbeddedPostgres from 'embedded-postgres';

const port = process.env.PORT ?? '3183';
const serverDir = new URL('..', import.meta.url).pathname;

const dataDir = await mkdtemp(join(tmpdir(), 'runout-web-e2e-pg-'));
const postgresPort = await freePort();
const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  port: postgresPort,
  user: 'runout',
  password: 'runout',
  persistent: false,
  onLog: () => {},
});

let stopping = false;
async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  server?.kill('SIGTERM');
  await postgres.stop().catch(() => {});
  await rm(dataDir, { recursive: true, force: true });
  process.exit(code);
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void stop(0));
}

let server: ReturnType<typeof spawn> | undefined;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('runout');
  const databaseUrl = `postgres://runout:runout@127.0.0.1:${postgresPort}/runout`;
  const db = drizzle(databaseUrl);
  await migrate(db, { migrationsFolder: join(serverDir, 'drizzle') });
  await db.$client.end();

  // Set explicitly, these win over apps/server/.env, which main.ts also reads.
  server = spawn('node', ['dist/main.js'], {
    cwd: serverDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: port,
      DATABASE_URL: databaseUrl,
      DEV_SIGN_IN: 'true',
      ADMINISTRATOR_EMAILS: '',
    },
  });
  server.once('exit', (code) => void stop(code ?? 1));
} catch (error) {
  console.error(error);
  await stop(1);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}
