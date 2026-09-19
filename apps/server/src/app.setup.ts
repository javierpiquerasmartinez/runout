import type { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { RejectionFilter } from './rejection/rejection.filter.js';

/** Wiring shared by the real server and the e2e harness. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalFilters(new RejectionFilter());
}
