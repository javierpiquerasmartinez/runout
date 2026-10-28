import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { RangesController } from './ranges.controller.js';
import { RangesService } from './ranges.service.js';

/** The Lab: an Account's study tools, apart from the Library and Rooms. */
@Module({
  imports: [IdentityModule],
  controllers: [RangesController],
  providers: [RangesService],
})
export class LabModule {}
