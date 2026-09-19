import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

// Local development reads apps/server/.env; in production the environment is set directly.
try {
  process.loadEnvFile();
} catch (error) {
  // A missing .env is fine; the environment may be set directly.
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
