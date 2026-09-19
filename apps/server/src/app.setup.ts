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
}
