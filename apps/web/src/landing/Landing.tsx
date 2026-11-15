import { useEffect, useRef, type CSSProperties } from 'react'
import { useI18n } from '../i18n'
import { whenIdle, whenPainted } from '../idle'
import { loginPath } from '../identity/accessPaths'
import { enterRoomPath } from '../room/roomCode'
import { followLink } from '../routing'
import { Brand } from '../ui/Brand'
import { captionAt, layoutFor, playheadAfter, stops, type Caption, type GraphOnScreen } from './scene/choreography'
import { depthOfFieldFor, tierFor, type Tier } from './scene/quality'
import { allInEvAt, sampleResults, totalOf, winRateOf, resultAt } from './scene/sampleResults'
import { graphInStill, stillOf } from './stills'
import './Landing.css'

const captions: Caption[] = ['opening', 'library', 'results', 'rooms']

/** The All-in EV line across a box 100 wide and 100 tall, its top the wave's crest. */
const allInEvPath = Array.from({ length: 61 }, (_, i) => {
  const x = i / 60
  return `${i === 0 ? 'M' : 'L'}${(x * 100).toFixed(2)} ${(100 - allInEvAt(x) * 100).toFixed(2)}`
}).join(' ')

/**
 * `/` and any unknown path for a Visitor: one Hand played in a 3D scene
 * behind the copy, stop by stop. The page is one screen per stop and snaps
 * to them; each scroll moves on one, and the story plays up to it at its own
 * pace rather than the finger's. Signing in and bringing a Room Code are in
 * a bar that never leaves the top. An Account never sees it: `/` is its Home.
 */
export function Landing() {
  const { t, formatNumber } = useI18n()
  const bigBlinds = (value: number) => t('room.table.bigBlinds', { value: formatNumber(value, { signDisplay: 'exceptZero' }) })
  const page = useRef<HTMLElement>(null)
  const figures = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const still = useRef<HTMLImageElement>(null)
  const copy = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const left = new AbortController()
    let dispose = () => {}
    let setProgress = (_progress: number) => {}

    // One picture per stop, and no glide between them, for whoever asked for less motion or can't run the scene.
    const device = {
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
      cores: navigator.hardwareConcurrency,
      memory: (navigator as { deviceMemory?: number }).deviceMemory,
    }
    let tier: Tier = tierFor(device)
    /** The scene can't be drawn here: a picture of it stands in at every stop. */
    let pictured = false

    let playhead = 0
    let frame = 0
    let last = 0

    /** Lays the Results Graph's figures where the graph of chips is on screen. */
    const layFigures = ({ showing, left, right, zero, crest, floor }: GraphOnScreen) => {
      const style = figures.current?.style
      if (!style) return
      style.opacity = String(showing)
      style.visibility = showing > 0 ? 'visible' : 'hidden'
      style.setProperty('--left', `${left}px`)
      style.setProperty('--width', `${right - left}px`)
      style.setProperty('--zero', `${zero}px`)
      style.setProperty('--crest', `${crest}px`)
      style.setProperty('--floor', `${floor}px`)
    }

    /** The stop the page is scrolled to: its screens are all the same height. */
    const screen = () => document.documentElement.scrollHeight / stops.length
    const stopAt = () => {
      const stop = Math.round(window.scrollY / screen())
      return Number.isFinite(stop) ? Math.min(stops.length - 1, Math.max(0, stop)) : 0
    }
    const show = () => {
      setProgress(playhead)
      // Faded out, never hidden: a screen reader reads every caption, in the story's order.
      copy.current?.querySelectorAll<HTMLElement>('[data-caption]').forEach((element) => {
        element.style.opacity = String(captionAt(element.dataset.caption as Caption, playhead))
      })
      // The stop the story is resting at, and none while it plays.
      if (!page.current) return
      if (playhead === stops[stopAt()].at) page.current.dataset.stop = String(stopAt())
      else delete page.current.dataset.stop
      // The picture of the stop, in the screen's shape: asked for only now that it is shown.
      if (pictured && still.current) {
        const address = stillOf(stopAt(), layoutFor(window.innerWidth / window.innerHeight).portrait)
        if (still.current.getAttribute('src') !== address) still.current.src = address
        still.current.hidden = false
        // No scene says where the graph is: the picture's graph is where the scene drew it.
        layFigures(graphInStill(stopAt(), window.innerWidth, window.innerHeight))
      }
    }
    /** Shows pictures of the scene in its place, and steps between stops as a still does. */
    const picture = () => {
      if (left.signal.aborted) return
      tier = 'still'
      pictured = true
      follow()
    }
    /** Plays towards the stop scrolled to, a frame at a time, and rests once there. */
    const play = (now: number) => {
      frame = 0
      playhead = tier === 'still' ? stops[stopAt()].at : playheadAfter(playhead, stopAt(), Math.min(0.1, (now - last) / 1000))
      last = now
      show()
      if (playhead !== stops[stopAt()].at) frame = requestAnimationFrame(play)
    }
    const follow = () => {
      if (frame) return
      last = performance.now()
      frame = requestAnimationFrame(play)
    }
    show()
    follow()
    window.addEventListener('scroll', follow, { signal: left.signal, passive: true })
    window.addEventListener('resize', follow, { signal: left.signal })

    /*
     * One gesture, one stop: a notch of the wheel, a short swipe or a key
     * scrolls the page a whole screen, however small the gesture. The page
     * still scrolls for real, so its scrollbar and the keyboard's Home and
     * End work as anywhere.
     */
    let heldUntil = 0
    const step = (by: number) => {
      const now = performance.now()
      // A trackpad's glide keeps sending wheel events long after the fingers lift.
      if (now < heldUntil) return
      const stop = Math.min(stops.length - 1, Math.max(0, stopAt() + by))
      if (stop === stopAt()) return
      heldUntil = now + 800
      window.scrollTo({ top: stop * screen(), behavior: tier === 'still' ? 'instant' : 'smooth' })
    }
    window.addEventListener(
      'wheel',
      (event) => {
        if (event.ctrlKey) return // Pinch to zoom.
        event.preventDefault()
        if (Math.abs(event.deltaY) >= 4) step(Math.sign(event.deltaY))
      },
      { signal: left.signal, passive: false },
    )
    let touchedAt: number | null = null
    window.addEventListener(
      'touchstart',
      // A second finger makes it a pinch, which is the browser's.
      (event) => (touchedAt = event.touches.length === 1 ? event.touches[0].clientY : null),
      { signal: left.signal, passive: true },
    )
    window.addEventListener(
      'touchend',
      (event) => {
        if (touchedAt === null) return
        const swiped = touchedAt - event.changedTouches[0].clientY
        touchedAt = null
        if (Math.abs(swiped) >= 32) {
          heldUntil = 0
          step(Math.sign(swiped))
        }
      },
      { signal: left.signal, passive: true },
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
        heldUntil = 0
        step(by)
      },
      { signal: left.signal },
    )

    // The scene and three.js come in their own chunk, asked for once the copy and the two ways on have painted and the browser is idle.
    const sceneLoaded = whenPainted(left.signal)
      .then(() => whenIdle(left.signal))
      .then(() => import('./scene/LandingScene'))
    void sceneLoaded.then(({ mountLandingScene }) => {
      if (left.signal.aborted || !canvas.current) return
      try {
        const scene = mountLandingScene(canvas.current, {
          tier,
          depthOfField: depthOfFieldFor(tier, device),
          onTier: (lower) => (tier = lower),
          onGraph: layFigures,
        })
        setProgress = scene.setProgress
        dispose = scene.dispose
        canvas.current.dataset.ready = 'true'
        show()
      } catch {
        // No WebGL.
        picture()
      }
    }, picture)

    return () => {
      left.abort()
      cancelAnimationFrame(frame)
      dispose()
    }
  }, [])

  return (
    <main ref={page} className="landing" data-theme="dark">
      {stops.map(({ at }) => (
        <div key={at} className="landing__stop" />
      ))}

      <canvas ref={canvas} className="landing__scene" aria-hidden="true" />
      {/* A picture of the scene, where the scene can't be drawn. */}
      <img ref={still} className="landing__still" alt="" aria-hidden="true" hidden />

      {/* The one moment of the app itself: the Results Graph's rules, figures and legend, round the graph of chips. */}
      <div ref={figures} className="landing__figures" aria-hidden="true">
        <ul className="landing__legend">
          <li>
            <span className="landing__swatch landing__swatch--result" />
            {t('library.results.line.result')}
            <b className="ro-mono">{bigBlinds(totalOf(resultAt))}</b>
          </li>
          <li>
            <span className="landing__swatch landing__swatch--ev" />
            {t('library.results.line.allInEv')}
            <b className="ro-mono">{bigBlinds(totalOf(allInEvAt))}</b>
          </li>
          <li>
            {t('library.results.winRate')}
            <b className="ro-mono">
              {formatNumber(winRateOf(resultAt), { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' })}
            </b>
          </li>
        </ul>
        {sampleResults.rules.map((figure) => (
          <span
            key={figure}
            className="landing__rule ro-mono"
            style={{ '--up': figure / sampleResults.crest } as CSSProperties}
          >
            {formatNumber(figure, { notation: 'compact', maximumFractionDigits: 1, signDisplay: 'exceptZero' })}
          </span>
        ))}
        <svg className="landing__ev" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d={allInEvPath} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="landing__hands ro-mono">{t('library.results.hand', { hand: 1 })}</span>
        <span className="landing__hands landing__hands--last ro-mono">
          {formatNumber(sampleResults.hands, { useGrouping: true })}
        </span>
      </div>

      <header className="landing__bar">
        <div className="landing__brand">
          <Brand size="landing" href={null} />
          <span className="landing__beta ro-mono">{t('brand.beta')}</span>
        </div>
        <nav className="landing__doors">
          <a href={enterRoomPath} className="landing__code" onClick={followLink}>
            {t('landing.haveCode')}
          </a>
          <a href={loginPath} className="ro-btn ro-btn--primary" onClick={followLink}>
            {t('landing.signIn')}
          </a>
        </nav>
      </header>

      <div ref={copy} className="landing__copy">
        {captions.map((caption) => (
          <div key={caption} className="landing__caption" data-caption={caption}>
            {caption === 'opening' ? (
              <h1 className="landing__title ro-serif">{t('landing.opening.title')}</h1>
            ) : (
              <h2 className="landing__title ro-serif">{t(`landing.${caption}.title`)}</h2>
            )}
            <p className="landing__line">{t(`landing.${caption}.line`)}</p>
            {caption === 'opening' && <p className="landing__hint ro-mono">{t('landing.scrollHint')}</p>}
            {caption === 'rooms' && <p className="landing__hint ro-mono">{t('landing.close.title')}</p>}
          </div>
        ))}
      </div>
    </main>
  )
}
