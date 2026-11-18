import { NestFactory } from '@nestjs/core';
import {
  migrationsApplied,
  newestMigration,
  waitForMigrations,
} from './database/migrations-applied.js';
import {
  configureImportService,
  ImportServiceModule,
} from './import-service/import-service.module.js';

// The import service's entry point; the API's is main.ts. See the README.
try {
  process.loadEnvFile();
} catch (error) {
  // A missing .env is fine; the environment may be set directly.
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

// Before anything claims work: the engine resumes Bulk Imports as soon as it
// boots, and only the API applies migrations. See the README's "Deploying".
const url = process.env.DATABASE_URL;
if (url) {
  const newest = newestMigration();
  await waitForMigrations({
    applied: () => migrationsApplied(url, newest),
    report: (line) => console.log(line),
  });
}

const app = await NestFactory.create(ImportServiceModule);
configureImportService(app);
// Render stops an instance with SIGTERM; this lets a batch's transaction end.
app.enableShutdownHooks();
await app.listen(process.env.PORT ?? 3001);
