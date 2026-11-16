import { Inject, Injectable } from '@nestjs/common';
import { PLAN_CATALOGUE, type PlanCatalogue } from './plan-catalogue.js';

/**
 * What an Account may do, by its Plan. Every other module asks it rather
 * than knowing about Plans or their limits.
 */
@Injectable()
export class Plans {
  constructor(
    @Inject(PLAN_CATALOGUE) private readonly catalogue: PlanCatalogue,
  ) {}

  /**
   * The most Hands the Account's Library may hold now. Asked each time it is
   * needed, never kept, so that a change of Plan applies at once.
   */
  libraryLimit(_accountId: string): Promise<number> {
    // Until Accounts are on Plans, every Account is on Pro.
    return Promise.resolve(this.catalogue.pro.libraryHands);
  }
}
