import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';

export interface HealthStatus {
  status: 'ok' | 'unavailable';
  database: 'reachable' | 'unreachable';
  uptimeSeconds: number;
  serverTime: string;
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** 200 when the server can serve requests; 503 when the database is unreachable. */
  @Get()
  async check(): Promise<HealthStatus> {
    const reachable = await this.databaseIsReachable();
    const health: HealthStatus = {
      status: reachable ? 'ok' : 'unavailable',
      database: reachable ? 'reachable' : 'unreachable',
      uptimeSeconds: Math.round(process.uptime()),
      serverTime: this.clock.now().toISOString(),
    };
    if (!reachable) throw new ServiceUnavailableException(health);
    return health;
  }

  private async databaseIsReachable(): Promise<boolean> {
    try {
      await this.db.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  }
}
