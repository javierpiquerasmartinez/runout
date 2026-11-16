import type { PlanCatalogue } from '../../src/plans/plan-catalogue.js';

/** A Plan catalogue in which every Plan's Library holds at most `hands` Hands. */
export function libraryLimitOf(hands: number): PlanCatalogue {
  return { beta: { libraryHands: hands }, pro: { libraryHands: hands } };
}
