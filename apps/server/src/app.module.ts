import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module.js';
import { CalendarModule } from './calendar/calendar.module.js';
import { ClockModule } from './clock/clock.module.js';
import { DatabaseModule } from './database/database.module.js';
import { GoalsModule } from './goals/goals.module.js';
import { HandsModule } from './hands/hands.module.js';
import { HealthController } from './health/health.controller.js';
import { IdentityModule } from './identity/identity.module.js';
import { ImportsModule } from './imports/imports.module.js';
import { LabModule } from './lab/lab.module.js';
import { LibraryModule } from './library/library.module.js';
import { MailModule } from './mail/mail.module.js';
import { PingGateway } from './realtime/ping.gateway.js';
import { RoomsModule } from './rooms/rooms.module.js';

@Module({
  imports: [
    ClockModule,
    DatabaseModule,
    MailModule,
    IdentityModule,
    RoomsModule,
    LibraryModule,
    LabModule,
    CalendarModule,
    GoalsModule,
    ImportsModule,
    HandsModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [PingGateway],
})
export class AppModule {}
