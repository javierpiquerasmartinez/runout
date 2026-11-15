/*
 * One gesture, one stop: which stop the Landing's story is asked to play to,
 * given what a Visitor's wheel, finger or keys have done and the stop the
 * page is already headed for. Plain numbers: nothing here knows of the page,
 * which listens for the gestures and does the scrolling (`story.ts`).
 */

/** One turn of the wheel, a trackpad's swipe with all of its glide, as far as it has been heard. */
export type WheelGesture = {
  /** When its last event came, in milliseconds. */
  at: number
  direction: 1 | -1
  /** The largest delta it has had, and the smallest since. */
  peak: number
  low: number
  /** Whether it has moved the story a stop already: it moves it one, and no more. */
  stepped: boolean
}

/** A turn too slight to mean anything: a wheel barely touched, the last of a glide. */
const slight = 4
/** The wheel has gone quiet once this long has passed with no event, in milliseconds: the next one starts a new gesture. */
const quiet = 180

/**
 * Hears one wheel event, after the gesture heard so far, and answers that
 * gesture as it now stands and the step it asks for: one stop on (1), one
 * back (-1) or none (0).
 *
 * A trackpad keeps sending events long after the fingers have lifted, each
 * smaller than the last, for as long as its glide lasts: all of them are the
 * one gesture, and move the story one stop. A new gesture is one that comes
 * after the wheel has gone quiet, turns the other way, or whose delta rises
 * again once it had fallen, which is a second swipe over the glide of the
 * first.
 */
export function wheelHeard(
  gesture: WheelGesture | null,
  { deltaY, at }: { deltaY: number; at: number },
): { gesture: WheelGesture; step: -1 | 0 | 1 } {
  const size = Math.abs(deltaY)
  const direction = deltaY < 0 ? -1 : 1
  const fresh = gesture === null || at - gesture.at > quiet || (size > 0 && direction !== gesture.direction) || risesAgain(gesture, size)
  const heard: WheelGesture = fresh
    ? { at, direction, peak: size, low: size, stepped: false }
    : { ...gesture, at, peak: Math.max(gesture.peak, size), low: size > gesture.peak ? size : Math.min(gesture.low, size) }
  if (heard.stepped || size < slight) return { gesture: heard, step: 0 }
  return { gesture: { ...heard, stepped: true }, step: direction }
}

/** Whether a delta is a second swipe over a glide: the glide had fallen to half its peak or less, and this is well over where it had got to. */
function risesAgain({ peak, low }: WheelGesture, size: number): boolean {
  return low <= peak / 2 && size >= low * 2 && size - low >= 10
}

/** Where a gesture sent the page: the stop it is scrolling to, and where it was scrolled to when it set off, in screens. */
export type Heading = { stop: number; from: number }

/** How near a stop the page must be scrolled to be there, in screens. */
const there = 0.01

/**
 * The stop the page is headed for, of stops 0 to `last`: the one a gesture
 * sent it to, while it is still on its way, and otherwise the one nearest
 * where it is scrolled to, `scrolled` screens down.
 */
export function stopHeadedFor(heading: Heading | null, scrolled: number, last: number): number {
  if (heading) return heading.stop
  return Number.isFinite(scrolled) ? Math.min(last, Math.max(0, Math.round(scrolled))) : 0
}

/**
 * The stop a step asks for: one on or one back from the stop headed for, not
 * from where the page happens to be scrolled to, so that in the middle of a
 * stretch a step back returns to the stop just left and a second step
 * forward goes one further.
 */
export function stopAskedFor(headedFor: number, by: number, last: number): number {
  return Math.min(last, Math.max(0, headedFor + by))
}

/**
 * Where a gesture sent the page, now that the page has scrolled: forgotten
 * once it is there, and when it is anywhere but on its way there, which is
 * something else having moved it (the scrollbar, Home or End).
 */
export function headingAfterScroll(heading: Heading | null, scrolled: number): Heading | null {
  if (!heading) return null
  if (Math.abs(scrolled - heading.stop) <= there) return null
  const [low, high] = heading.from < heading.stop ? [heading.from, heading.stop] : [heading.stop, heading.from]
  return scrolled < low - there || scrolled > high + there ? null : heading
}
