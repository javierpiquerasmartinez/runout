import type { Locale, Messages } from './catalogue'

/**
 * The languages whose whole catalogue is here from the app's first moment:
 * none, since each arrives when it is asked for (`catalogue`). A test has
 * them all from the start, so that what it renders never waits for one:
 * `test/setup.ts` puts them here in this module's place.
 */
export const held: Partial<Record<Locale, Messages>> = {}
