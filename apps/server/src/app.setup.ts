import type { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';

/** Wiring shared by the real server and the e2e harness. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useWebSocketAdapter(new WsAdapter(app));
}
