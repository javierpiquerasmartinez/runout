import { Module } from '@nestjs/common';
import { DEFAULT_PLAN_CATALOGUE, PLAN_CATALOGUE } from './plan-catalogue.js';
import { Plans } from './plans.js';

@Module({
  providers: [
    { provide: PLAN_CATALOGUE, useValue: DEFAULT_PLAN_CATALOGUE },
    Plans,
  ],
  exports: [Plans],
})
export class PlansModule {}
