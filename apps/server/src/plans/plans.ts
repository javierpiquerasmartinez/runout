import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Database, Transaction } from '../database/database.js';
import { identities } from '../database/schema.js';
import {
  ADMINISTRATOR_EMAILS,
  type AdministratorEmails,
} from '../identity/administrators.js';
import {
  PLAN_CATALOGUE,
  RUNOUT_LIBRARY_HANDS,
  type PlanCatalogue,
  type PlanKey,
} from './plan-catalogue.js';

/** The most Hands a Library may hold, and the Plan that sets it. */
export interface LibraryLimit {
  hands: number;
  /**
   * The Plan whose limit it is; null when no Plan limits the Library: an
   * Administrator acting as themselves, held only to Runout's own.
   */
  plan: PlanKey | null;
}

/** What `Plans` needs to know of an Account. */
export interface PlannedAccount {
  email: string | null;
  plan: PlanKey | null;
}

/**
 * What an Account may do, by its Plan. Every other module asks it rather
 * than knowing about Plans or their limits.
 */
@Injectable()
export class Plans {
  constructor(
    @Inject(PLAN_CATALOGUE) private readonly catalogue: PlanCatalogue,
    @Inject(ADMINISTRATOR_EMAILS)
    private readonly administrators: AdministratorEmails,
  ) {}

  /**
   * The most Hands the Account's Library may hold now, read in `db` (the
   * caller's transaction, when it has one). Asked each time it is needed,
   * never kept, so that a change of Plan applies at once.
   */
  async libraryLimit(
    db: Database | Transaction,
    accountId: string,
  ): Promise<LibraryLimit> {
    const [account] = await db
      .select({ email: identities.email, plan: identities.plan })
      .from(identities)
      .where(eq(identities.id, accountId));
    return this.libraryLimitOf(account ?? { email: null, plan: null });
  }

  /**
   * The most Hands this Account's Library may hold. An Administrator is
   * never limited by their own Plan, only by Runout's own; an Impersonation
   * acts as an Account that is never an Administrator, so its Plan applies.
   */
  libraryLimitOf(account: PlannedAccount): LibraryLimit {
    if (account.plan === null || this.administrators.includes(account.email)) {
      return { hands: RUNOUT_LIBRARY_HANDS, plan: null };
    }
    return {
      hands: this.catalogue[account.plan].libraryHands,
      plan: account.plan,
    };
  }
}
