import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../clock/clock.js';
import { DATABASE, type Database } from '../database/database.js';

export interface HealthStatus {
  status: 'ok';
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

  @Get()
  async check(): Promise<HealthStatus> {
    return {
      status: 'ok',
      database: (await this.databaseIsReachable())
        ? 'reachable'
        : 'unreachable',
      uptimeSeconds: Math.round(process.uptime()),
      serverTime: this.clock.now().toISOString(),
    };
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
