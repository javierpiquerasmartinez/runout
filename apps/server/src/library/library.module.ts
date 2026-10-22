import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';
import { ResultsService } from './results.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [LibraryController],
  providers: [LibraryService, ResultsService],
  exports: [LibraryService],
})
export class LibraryModule {}
