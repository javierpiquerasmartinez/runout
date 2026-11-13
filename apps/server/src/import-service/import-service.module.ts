import { type INestApplication, Module } from '@nestjs/common';
import { ClockModule } from '../clock/clock.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { FILE_STORE } from '../file-store/file-store.js';
import { fileStoreFromEnv } from '../file-store/file-store.module.js';
import { HeroResultsModule } from '../hands/hero-results.module.js';
import {
  DEFAULT_LIBRARY_CAPACITY,
  LIBRARY_CAPACITY,
} from '../library/library-limits.js';
import { RejectionFilter } from '../rejection/rejection.filter.js';
import { WAKE_SECRET, wakeSecretFromEnv } from './import-service-config.js';
import {
  BULK_IMPORT_LIMIT,
  DEFAULT_BULK_IMPORT_LIMIT,
} from './bulk-import-limit.js';
import { ImportEngine } from './import-engine.js';
import { WakeController } from './wake.controller.js';

/**
 * The import service: the same code as the API, started from its own entry
 * point, with no Rooms and none of the API's routes. Its only route is the
 * wake.
 */
@Module({
  imports: [ClockModule, DatabaseModule, HeroResultsModule],
  controllers: [WakeController],
  providers: [
    { provide: WAKE_SECRET, useFactory: () => wakeSecretFromEnv(process.env) },
    // It has nothing to import from without one.
    {
      provide: FILE_STORE,
      useFactory: () => fileStoreFromEnv(process.env, true),
    },
    { provide: BULK_IMPORT_LIMIT, useValue: DEFAULT_BULK_IMPORT_LIMIT },
    { provide: LIBRARY_CAPACITY, useValue: DEFAULT_LIBRARY_CAPACITY },
    ImportEngine,
  ],
})
export class ImportServiceModule {}

/** Wiring shared by the real import service and the e2e harness. */
export function configureImportService(app: INestApplication): void {
  app.useGlobalFilters(new RejectionFilter());
}
