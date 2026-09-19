import { defineConfig } from 'drizzle-kit';

try {
  process.loadEnvFile();
} catch (error) {
  // A missing .env is fine; the environment may be set directly.
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
