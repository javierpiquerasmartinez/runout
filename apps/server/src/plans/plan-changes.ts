import type { Database, Transaction } from '../database/database.js';
import { planChanges } from '../database/schema.js';
import type { PlanChangeHow, PlanKey } from './plan-catalogue.js';

/** One change of an Account's Plan, as it is recorded. */
export interface PlanChange {
  accountId: string;
  /** Null for the Account's first Plan. */
  before: PlanKey | null;
  after: PlanKey;
  at: Date;
  how: PlanChangeHow;
  /** The Administrator who made it, when one did. */
  administratorId?: string | null;
}

/**
 * Records a change of an Account's Plan, in the transaction that makes it, so
 * that its history holds every Plan it has been on, its first one included.
 */
export async function recordPlanChange(
  db: Database | Transaction,
  change: PlanChange,
): Promise<void> {
  await db.insert(planChanges).values({
    accountId: change.accountId,
    planBefore: change.before,
    planAfter: change.after,
    changedAt: change.at,
    how: change.how,
    administratorId: change.administratorId ?? null,
  });
}
