import { type INestApplication, Module } from '@nestjs/common';
import { ClockModule } from '../clock/clock.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { RejectionFilter } from '../rejection/rejection.filter.js';
import { WAKE_SECRET, wakeSecretFromEnv } from './import-service-config.js';
import { ImportEngine } from './import-engine.js';
import { WakeController } from './wake.controller.js';

/**
 * The import service: the same code as the API, started from its own entry
 * point, with no Rooms and none of the API's routes. Its only route is the
 * wake.
 */
@Module({
  imports: [ClockModule, DatabaseModule],
  controllers: [WakeController],
  providers: [
    { provide: WAKE_SECRET, useFactory: () => wakeSecretFromEnv(process.env) },
    ImportEngine,
  ],
})
export class ImportServiceModule {}

/** Wiring shared by the real import service and the e2e harness. */
export function configureImportService(app: INestApplication): void {
  app.useGlobalFilters(new RejectionFilter());
}
