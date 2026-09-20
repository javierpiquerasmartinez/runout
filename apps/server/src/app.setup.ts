import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { RejectionFilter } from './rejection/rejection.filter.js';

/** Wiring shared by the real server and the e2e harness. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  // A pasted session of a few thousand Hands, well past Express's 100 KB.
  (app as NestExpressApplication).useBodyParser('json', { limit: '5mb' });
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalFilters(new RejectionFilter());
  // The REST API is cross-origin in production (frontend on Vercel, backend on Render), so
  // the browser needs this to allow it. The WebSocket gateway doesn't go through Express and
  // isn't origin-restricted by the browser either way. Unset in local dev, where Vite's proxy
  // makes everything same-origin.
  const allowedOrigins = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true });
}
