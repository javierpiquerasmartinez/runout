import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';
import { ResultsService } from './results.service.js';
import { TagsController } from './tags.controller.js';
import { TagsService } from './tags.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [LibraryController, TagsController],
  providers: [LibraryService, ResultsService, TagsService],
  exports: [LibraryService],
})
export class LibraryModule {}
