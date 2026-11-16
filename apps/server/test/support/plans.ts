import {
  RUNOUT_LIBRARY_HANDS,
  type PlanCatalogue,
} from '../../src/plans/plan-catalogue.js';

/** A Plan catalogue in which every Plan's Library holds at most `hands` Hands. */
export function libraryLimitOf(hands: number): PlanCatalogue {
  return { beta: { libraryHands: hands }, pro: { libraryHands: hands } };
}

/** A Plan catalogue in which a Beta's Library holds at most `hands` Hands, and a Pro's Runout's own. */
export function betaLimitOf(hands: number): PlanCatalogue {
  return {
    beta: { libraryHands: hands },
    pro: { libraryHands: RUNOUT_LIBRARY_HANDS },
  };
}
