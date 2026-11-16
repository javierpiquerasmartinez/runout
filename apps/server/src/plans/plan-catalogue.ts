/** The most Hands any Library may hold: Runout's own ceiling. */
export const RUNOUT_LIBRARY_HANDS = 10_000_000;

/** The Plans an Account can be on. */
export type PlanKey = 'pro';

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
  pro: { libraryHands: RUNOUT_LIBRARY_HANDS },
};
