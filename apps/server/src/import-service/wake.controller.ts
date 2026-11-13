import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Rejected } from '../rejection/rejection.js';
import { WAKE_SECRET } from './import-service-config.js';
import { ImportEngine } from './import-engine.js';

/**
 * The import service's only route, reached by the API over the private
 * network. It answers at once and leaves the engine working.
 */
@Controller('wake')
export class WakeController {
  private readonly logger = new Logger(WakeController.name);

  constructor(
    @Inject(WAKE_SECRET) private readonly secret: string,
    private readonly engine: ImportEngine,
  ) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  wake(@Headers('authorization') authorization?: string): void {
    if (!this.carriesSecret(authorization)) throw new Rejected('unauthenticated');
    this.engine.workUntilNothingLeft().catch((error: unknown) => {
      this.logger.error(
        `The import engine stopped: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private carriesSecret(authorization: string | undefined): boolean {
    const given = authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!given) return false;
    // Equal-length digests, compared in constant time.
    return timingSafeEqual(digest(given), digest(this.secret));
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
