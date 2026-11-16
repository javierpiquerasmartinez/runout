/** The most Hands any Library may hold: Runout's own ceiling. */
export const RUNOUT_LIBRARY_HANDS = 10_000_000;

/** Runout's own ceiling in force, injected so that tests can give a small one. */
export const RUNOUT_LIBRARY_LIMIT = Symbol('RUNOUT_LIBRARY_LIMIT');

/** The Plans an Account can be on. */
export const PLAN_KEYS = ['beta', 'pro'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

/** The Plan an Invitation offers unless the Administrator picks another. */
export const INVITATION_DEFAULT_PLAN: PlanKey = 'beta';

/**
 * How an Account's Plan came to change: an Administrator changed it, it was
 * the one its Invitation offered, the migration that brought Plans gave it to
 * an Account that already existed, or Test mode made a persona's Account on
 * it. Subscriptions, codes and gifts will add more.
 */
export const PLAN_CHANGE_HOWS = [
  'administrator',
  'invitation',
  'migration',
  'test-mode',
] as const;
export type PlanChangeHow = (typeof PLAN_CHANGE_HOWS)[number];

/** What a Plan allows. Every Plan defines every limit. */
export interface PlanLimits {
  /** The most Hands the Library may hold. */
  libraryHands: number;
}

/** Every Plan and what it allows. */
export type PlanCatalogue = Record<PlanKey, PlanLimits>;

/** The Plan catalogue in force, injected so that tests can give small limits. */
export const PLAN_CATALOGUE = Symbol('PLAN_CATALOGUE');

/** Runout's Plans in production. */
export const DEFAULT_PLAN_CATALOGUE: PlanCatalogue = {
  beta: { libraryHands: 20_000 },
  pro: { libraryHands: RUNOUT_LIBRARY_HANDS },
};
