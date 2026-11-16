import { Module } from '@nestjs/common';
import {
  ADMINISTRATOR_EMAILS,
  administratorEmailsFromEnv,
} from '../identity/administrators.js';
import { DEFAULT_PLAN_CATALOGUE, PLAN_CATALOGUE } from './plan-catalogue.js';
import { Plans } from './plans.js';

@Module({
  providers: [
    { provide: PLAN_CATALOGUE, useValue: DEFAULT_PLAN_CATALOGUE },
    // Administrators are never limited by their own Plan.
    {
      provide: ADMINISTRATOR_EMAILS,
      useFactory: () => administratorEmailsFromEnv(process.env),
    },
    Plans,
  ],
  exports: [Plans],
})
export class PlansModule {}
