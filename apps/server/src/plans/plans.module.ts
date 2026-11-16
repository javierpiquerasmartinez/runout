import { Module } from '@nestjs/common';
import { AdministratorsModule } from '../identity/administrators.module.js';
import {
  DEFAULT_PLAN_CATALOGUE,
  PLAN_CATALOGUE,
  RUNOUT_LIBRARY_HANDS,
  RUNOUT_LIBRARY_LIMIT,
} from './plan-catalogue.js';
import { Plans } from './plans.js';

@Module({
  // Administrators are never limited by their own Plan.
  imports: [AdministratorsModule],
  providers: [
    { provide: PLAN_CATALOGUE, useValue: DEFAULT_PLAN_CATALOGUE },
    { provide: RUNOUT_LIBRARY_LIMIT, useValue: RUNOUT_LIBRARY_HANDS },
    Plans,
  ],
  exports: [PLAN_CATALOGUE, Plans],
})
export class PlansModule {}
