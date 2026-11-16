/*
 * The Landing's story, told on the page: it plays to the stop the page is
 * headed for at its own pace, shows the caption of wherever it has got to,
 * takes a Visitor's gestures for steps from stop to stop, and brings the
 * scene in once the copy has painted, or pictures of it where it can't be
 * drawn. What to show is `scene/choreography`'s to say, and which stop a
 * gesture asks for is `stepping`'s; here is the page they are said to.
 */
import { whenIdle, whenPainted } from '../idle'
import { captionAt, layoutFor, playheadAfter, stops, type Caption, type GraphOnScreen } from './scene/choreography'
import { depthOfFieldFor, tierFor, type Device, type Tier } from './scene/quality'
import { graphInStill, stillOf } from './stills'
import { headingAfterScroll, stopAskedFor, stopHeadedFor, wheelHeard, type Heading, type WheelGesture } from './stepping'

/** What of the page the story is told on. */
export type Stage = {
  page: HTMLElement
  /** The captions, each marked with the `data-caption` it is. */
  copy: HTMLElement
  canvas: HTMLCanvasElement
  /** The picture that stands in for the scene. */
  still: HTMLImageElement
  /** The Results Graph's figures, laid round the graph of chips. */
  figures: HTMLElement
}

const lastStop = stops.length - 1

/** What the device says of itself before a frame is drawn. */
function deviceHere(): Device {
  return {
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    cores: navigator.hardwareConcurrency,
    memory: (navigator as { deviceMemory?: number }).deviceMemory,
  }
}

/** How far down the page is scrolled, in screens: its screens are all the same height, one a stop. */
function scrolledTo(): number {
  const screens = window.scrollY / (document.documentElement.scrollHeight / stops.length)
  return Number.isFinite(screens) ? screens : 0
}

/** Lays the Results Graph's figures where the graph of chips is on screen. */
function layFigures(figures: HTMLElement, { showing, left, right, zero, crest, floor }: GraphOnScreen) {
  const { style } = figures
  style.opacity = String(showing)
  style.visibility = showing > 0 ? 'visible' : 'hidden'
  style.setProperty('--left', `${left}px`)
  style.setProperty('--width', `${right - left}px`)
  style.setProperty('--zero', `${zero}px`)
  style.setProperty('--crest', `${crest}px`)
  style.setProperty('--floor', `${floor}px`)
}

/**
 * Hears a Visitor's gestures until `signal` aborts, and tells `step` of each
 * that asks for a stop: one on (1) or one back (-1). A notch of the wheel or
 * a trackpad's swipe, a short swipe of one finger, and the keys that scroll
 * a page. Pinching, with two fingers or with the wheel, is left to the browser.
 */
function hearSteps(step: (by: 1 | -1) => void, signal: AbortSignal) {
  let wheel: WheelGesture | null = null
  window.addEventListener(
    'wheel',
    (event) => {
      if (event.ctrlKey) return // Pinch to zoom.
      event.preventDefault()
      const heard = wheelHeard(wheel, { deltaY: event.deltaY, at: event.timeStamp })
      wheel = heard.gesture
      if (heard.step) step(heard.step)
    },
    { signal, passive: false },
  )

  let touchedAt: number | null = null
  window.addEventListener(
    'touchstart',
    // A second finger makes it a pinch, which is the browser's.
    (event) => (touchedAt = event.touches.length === 1 ? event.touches[0].clientY : null),
    { signal, passive: true },
  )
  window.addEventListener(
    'touchend',
    (event) => {
      if (touchedAt === null) return
      const swiped = touchedAt - event.changedTouches[0].clientY
      touchedAt = null
      if (Math.abs(swiped) >= 32) step(swiped > 0 ? 1 : -1)
    },
    { signal, passive: true },
  )

  window.addEventListener(
    'keydown',
    (event) => {
      const by =
        event.key === 'ArrowDown' || event.key === 'PageDown' || (event.key === ' ' && !event.shiftKey)
          ? 1
          : event.key === 'ArrowUp' || event.key === 'PageUp' || (event.key === ' ' && event.shiftKey)
            ? -1
            : 0
      // With a modifier the key is the browser's or the system's.
      if (!by || event.metaKey || event.ctrlKey || event.altKey) return
      event.preventDefault()
      step(by)
    },
    { signal },
  )
}

/**
 * Tells the story on `stage` until `signal` aborts. The page is one screen
 * per stop: a gesture scrolls it a whole screen, however small the gesture,
 * and the story plays up to the stop it is headed for. The page scrolls for
 * real, so its scrollbar and the keyboard's Home and End work as anywhere.
 */
export function tellStory({ page, copy, canvas, still, figures }: Stage, signal: AbortSignal) {
  const device = deviceHere()
  // One picture per stop, and no glide between them, for whoever asked for less motion or can't run the scene.
  let tier: Tier = tierFor(device)
  /** The scene, once it is here and for as long as it can be drawn. */
  let scene: { setProgress(progress: number): void; dispose(): void } | null = null
  /** The scene can't be drawn here: a picture of it stands in at every stop. */
  let pictured = false

  let playhead = 0
  let frame = 0
  let last = 0
  /** Where the last step sent the page, while it is on its way. */
  let heading: Heading | null = null

  /** The stop the page is scrolled to, and the one it is headed for: the same, but while a step's scroll is under way. */
  const stopAt = () => stopHeadedFor(null, scrolledTo(), lastStop)
  const headedFor = () => stopHeadedFor(heading, scrolledTo(), lastStop)

  const show = () => {
    scene?.setProgress(playhead)
    // Faded out, never hidden: a screen reader reads every caption, in the story's order.
    copy.querySelectorAll<HTMLElement>('[data-caption]').forEach((element) => {
      element.style.opacity = String(captionAt(element.dataset.caption as Caption, playhead))
    })
    // The stop the story is resting at, and none while it plays.
    const stop = stopAt()
    if (playhead === stops[stop].at) page.dataset.stop = String(stop)
    else delete page.dataset.stop
    // The picture of the stop, in the screen's shape: asked for only now that it is shown.
    if (pictured) {
      const address = stillOf(stop, layoutFor(window.innerWidth / window.innerHeight).portrait)
      if (still.getAttribute('src') !== address) still.src = address
      still.hidden = false
      // No scene says where the graph is: the picture's graph is where the scene drew it.
      layFigures(figures, graphInStill(stop, window.innerWidth, window.innerHeight))
    }
  }
  /** Plays towards the stop headed for, a frame at a time, and rests once there. */
  const play = (now: number) => {
    frame = 0
    const goal = headedFor()
    playhead = tier === 'still' ? stops[goal].at : playheadAfter(playhead, goal, Math.min(0.1, (now - last) / 1000))
    last = now
    show()
    if (playhead !== stops[goal].at) frame = requestAnimationFrame(play)
  }
  const follow = () => {
    if (frame) return
    last = performance.now()
    frame = requestAnimationFrame(play)
  }
  /** Shows pictures of the scene in its place, and steps between stops as a still does. */
  const picture = () => {
    if (signal.aborted) return
    tier = 'still'
    pictured = true
    follow()
  }

  show()
  follow()
  window.addEventListener(
    'scroll',
    () => {
      heading = headingAfterScroll(heading, scrolledTo())
      follow()
    },
    { signal, passive: true },
  )
  // Wherever a scroll ends, nothing is on its way any more: one cut short is not left as the stop headed for.
  window.addEventListener('scrollend', () => (heading = null), { signal, passive: true })
  window.addEventListener('resize', follow, { signal })

  hearSteps((by) => {
    const stop = stopAskedFor(headedFor(), by, lastStop)
    if (stop === headedFor()) return
    heading = { stop, from: scrolledTo() }
    window.scrollTo({
      top: stop * (document.documentElement.scrollHeight / stops.length),
      behavior: tier === 'still' ? 'instant' : 'smooth',
    })
    follow()
  }, signal)

  // The scene and three.js come in their own chunk, asked for once the copy and the two ways on have painted and the browser is idle.
  whenPainted(signal)
    .then(() => whenIdle(signal))
    .then(() => import('./scene/LandingScene'))
    .then(({ mountLandingScene }) => {
      if (signal.aborted) return
      scene = mountLandingScene(canvas, {
        tier,
        depthOfField: depthOfFieldFor(tier, device),
        onTier: (lower) => (tier = lower),
        onGraph: (graph) => layFigures(figures, graph),
      })
      canvas.dataset.ready = 'true'
      show()
      // The browser took the graphics context back (the card reset, too many of them open): nothing more can be drawn on this canvas.
      canvas.addEventListener(
        'webglcontextlost',
        () => {
          scene?.dispose()
          scene = null
          delete canvas.dataset.ready
          picture()
        },
        { signal },
      )
    })
    // The chunk didn't arrive, or there is no WebGL to draw with.
    .catch(picture)

  signal.addEventListener('abort', () => {
    cancelAnimationFrame(frame)
    scene?.dispose()
    scene = null
  })
}
