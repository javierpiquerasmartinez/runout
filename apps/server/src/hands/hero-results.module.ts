import { Module } from '@nestjs/common';
import { HeroResults } from './hero-results.js';

/** The one pool of threads working out All-in EV, shared by every import. */
@Module({
  providers: [HeroResults],
  exports: [HeroResults],
})
export class HeroResultsModule {}
