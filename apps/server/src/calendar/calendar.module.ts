import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { MilestonesController } from './milestones.controller.js';
import { MilestonesService } from './milestones.service.js';

/** The Calendar: an Account's study plan, its Milestones, apart from everything else. */
@Module({
  imports: [IdentityModule],
  controllers: [MilestonesController],
  providers: [MilestonesService],
})
export class CalendarModule {}
