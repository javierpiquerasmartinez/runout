import { Module } from '@nestjs/common';
import { ClockModule } from './clock/clock.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { IdentityModule } from './identity/identity.module.js';
import { PingGateway } from './realtime/ping.gateway.js';
import { RoomsModule } from './rooms/rooms.module.js';

@Module({
  imports: [ClockModule, DatabaseModule, IdentityModule, RoomsModule],
  controllers: [HealthController],
  providers: [PingGateway],
})
export class AppModule {}
