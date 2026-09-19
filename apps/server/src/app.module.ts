import { Module } from '@nestjs/common';
import { ClockModule } from './clock/clock.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { PingGateway } from './realtime/ping.gateway.js';

@Module({
  imports: [ClockModule, DatabaseModule],
  controllers: [HealthController],
  providers: [PingGateway],
})
export class AppModule {}
