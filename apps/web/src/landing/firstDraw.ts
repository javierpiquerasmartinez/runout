/**
 * What the app does, as it starts, with the Landing its document may hold:
 *
 * - `nothing`: the browser is being taken to the Landing in another language,
 *   and nothing is to show until it is there.
 * - `take-over`: a Visitor's first draw is that same Landing, so the app
 *   takes the markup over as it is and nothing is drawn twice.
 * - `once-recognised`: the browser holds a token that is not known to be an
 *   Account's, so it is most likely an anonymous identity's, who is shown the
 *   Landing too. The document's stays on screen while the server says whose
 *   the token is, and the app draws in its place once it has.
 * - `afresh`: there is no Landing in the document, or it was kept out of
 *   sight of an Account on its way Home. The app draws from nothing.
 */
export type FirstDraw = 'nothing' | 'take-over' | 'once-recognised' | 'afresh'

export function firstDraw(page: {
  /** The script in the document's head is taking the browser elsewhere (`data-landing="leaving"`). */
  leaving: boolean
  /** The document arrived with the Landing rendered into it. */
  landingInDocument: boolean
  /** The browser holds a token, and the marker that it is an Account's (`identity/identity.ts`). */
  holdsSession: boolean
  holdsAccount: boolean
}): FirstDraw {
  if (page.leaving) return 'nothing'
  if (!page.landingInDocument) return 'afresh'
  if (!page.holdsSession) return 'take-over'
  return page.holdsAccount ? 'afresh' : 'once-recognised'
}
