import { Module } from '@nestjs/common';
import { HeroResultsModule } from '../hands/hero-results.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import {
  DEFAULT_LIBRARY_CAPACITY,
  LIBRARY_CAPACITY,
} from './library-limits.js';
import { LibraryNotesController } from './library-notes.controller.js';
import { LibraryController } from './library.controller.js';
import { LibraryService } from './library.service.js';
import { ResultsService } from './results.service.js';
import { StatsService } from './stats.service.js';
import { TagsController } from './tags.controller.js';
import { TagsService } from './tags.service.js';

@Module({
  imports: [HeroResultsModule, IdentityModule, RoomsModule],
  controllers: [LibraryController, LibraryNotesController, TagsController],
  providers: [
    LibraryService,
    ResultsService,
    StatsService,
    TagsService,
    { provide: LIBRARY_CAPACITY, useValue: DEFAULT_LIBRARY_CAPACITY },
  ],
  exports: [LibraryService],
})
export class LibraryModule {}
