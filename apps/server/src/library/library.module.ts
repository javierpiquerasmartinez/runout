import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}
