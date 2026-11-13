import { Module } from '@nestjs/common';
import { BulkImportsModule } from '../bulk-imports/bulk-imports.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { StorageModule } from '../storage/storage.js';
import { AccountsService } from './accounts.service.js';
import { AdminController } from './admin.controller.js';
import { BulkImportsAdminService } from './bulk-imports-admin.service.js';
import { RoomsAdminService } from './rooms-admin.service.js';

/** The Administrator panel (ADR 0008). */
@Module({
  imports: [IdentityModule, RoomsModule, BulkImportsModule, StorageModule],
  controllers: [AdminController],
  providers: [AccountsService, RoomsAdminService, BulkImportsAdminService],
})
export class AdminModule {}
