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
  RUNOUT_LIBRARY_LIMIT,
  type PlanCatalogue,
  type PlanKey,
} from './plan-catalogue.js';

/** The most Hands a Library may hold, and the Plan that sets it. */
export interface LibraryLimit {
  hands: number;
  /**
   * The Plan whose limit it is; null when it is Runout's own: for an
   * Administrator acting as themselves, whom no Plan limits, or where a
   * Plan would allow more than Runout's own.
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
    @Inject(RUNOUT_LIBRARY_LIMIT) private readonly runoutLibraryHands: number,
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
    const runouts: LibraryLimit = {
      hands: this.runoutLibraryHands,
      plan: null,
    };
    if (account.plan === null || this.administrators.includes(account.email)) {
      return runouts;
    }
    const hands = this.catalogue[account.plan].libraryHands;
    return hands > this.runoutLibraryHands
      ? runouts
      : { hands, plan: account.plan };
  }

  /**
   * The most Hands this Account's Library may hold where its Plan holds it
   * below Runout's own limit, as a Beta's; null where nothing below Runout's
   * own does, so that there is no limit worth showing.
   */
  libraryLimitBelowRunoutsOf(account: PlannedAccount): number | null {
    const limit = this.libraryLimitOf(account);
    return limit.hands < this.runoutLibraryHands ? limit.hands : null;
  }
}
