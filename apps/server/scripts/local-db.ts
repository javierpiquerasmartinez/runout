// Runs a local Postgres for development, matching .env.example. Data persists in
// apps/server/.data/postgres between runs. Stop it with Ctrl+C.
import { existsSync } from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

const databaseDir = new URL('../.data/postgres', import.meta.url).pathname;
const firstRun = !existsSync(databaseDir);
const postgres = new EmbeddedPostgres({
  databaseDir,
  port: 5432,
  user: 'runout',
  password: 'runout',
  persistent: true,
  onLog: () => {},
});

if (firstRun) await postgres.initialise();
await postgres.start();
if (firstRun) await postgres.createDatabase('runout');
console.log('Postgres ready at postgres://runout:runout@localhost:5432/runout');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void postgres.stop().then(() => process.exit(0));
  });
}
