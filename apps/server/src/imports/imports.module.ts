import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { LibraryModule } from '../library/library.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [IdentityModule, RoomsModule, LibraryModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
