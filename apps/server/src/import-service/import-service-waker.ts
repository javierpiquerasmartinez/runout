import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import {
  IMPORT_SERVICE,
  importServiceFromEnv,
  type ImportServiceAddress,
} from './import-service-config.js';
import { messageOf } from './message-of.js';

/** How long the API waits for the import service to acknowledge. */
const WAKE_TIMEOUT_MS = 5_000;

/**
 * Tells the import service there may be work. A wake that fails is logged
 * and never fails the request that asked for it: the hourly check wakes the
 * service again.
 */
@Injectable()
export class ImportServiceWaker {
  private readonly logger = new Logger(ImportServiceWaker.name);

  constructor(
    @Inject(IMPORT_SERVICE)
    private readonly service: ImportServiceAddress | null,
  ) {}

  /** Whether the service acknowledged the wake. */
  async wake(): Promise<boolean> {
    if (!this.service) {
      this.logger.warn('No import service is configured; nothing was woken.');
      return false;
    }
    try {
      const response = await fetch(`http://${this.service.address}/wake`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.service.secret}` },
        signal: AbortSignal.timeout(WAKE_TIMEOUT_MS),
      });
      if (response.ok) return true;
      this.logger.error(
        `The import service answered a wake with ${response.status}.`,
      );
    } catch (error) {
      this.logger.error(
        `The import service could not be woken: ${messageOf(error)}`,
      );
    }
    return false;
  }
}

@Module({
  providers: [
    {
      provide: IMPORT_SERVICE,
      useFactory: () => importServiceFromEnv(process.env),
    },
    ImportServiceWaker,
  ],
  exports: [ImportServiceWaker],
})
export class ImportServiceWakerModule {}
