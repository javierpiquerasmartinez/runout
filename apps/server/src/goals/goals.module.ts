import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { GoalsController } from './goals.controller.js';
import { GoalsService } from './goals.service.js';

/** Goals: what an Account is working towards, apart from everything else. */
@Module({
  imports: [IdentityModule],
  controllers: [GoalsController],
  providers: [GoalsService],
})
export class GoalsModule {}
