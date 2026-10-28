import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { LabTagsController } from './lab-tags.controller.js';
import { LabTagsService } from './lab-tags.service.js';
import { RangesController } from './ranges.controller.js';
import { RangesService } from './ranges.service.js';

/** The Lab: an Account's study tools, apart from the Library and Rooms. */
@Module({
  imports: [IdentityModule],
  controllers: [RangesController, LabTagsController],
  providers: [RangesService, LabTagsService],
})
export class LabModule {}
