import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { PingGateway } from './realtime/ping.gateway.js';

@Module({
  controllers: [HealthController],
  providers: [PingGateway],
})
export class AppModule {}
