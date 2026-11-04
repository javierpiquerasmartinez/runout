import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { AccountsService } from './accounts.service.js';
import { AdminController } from './admin.controller.js';
import { RoomsAdminService } from './rooms-admin.service.js';

/** The Administrator panel (ADR 0008). */
@Module({
  imports: [IdentityModule, RoomsModule],
  controllers: [AdminController],
  providers: [AccountsService, RoomsAdminService],
})
export class AdminModule {}
