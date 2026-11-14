import { useEffect, useRef, type CSSProperties } from 'react'
import { useI18n } from '../i18n'
import { enterRoomPath } from '../room/roomCode'
import { followLink } from '../routing'
import { Brand } from '../ui/Brand'
import { loginPath } from './LoginPage'
import { captionAt, playheadAfter, stops, type Caption } from './scene/choreography'
import { depthOfFieldFor, tierFor, type Tier } from './scene/quality'
import { allInEvAt, sampleResults, totalOf, winRateOf, resultAt } from './scene/sampleResults'
import './LandingLabPage.css'

export const landingLabPath = '/landing-lab'

const captions: Caption[] = ['opening', 'library', 'results', 'rooms']

/** The All-in EV line across a box 100 wide and 100 tall, its top the wave's crest. */
const allInEvPath = Array.from({ length: 61 }, (_, i) => {
  const x = i / 60
  return `${i === 0 ? 'M' : 'L'}${(x * 100).toFixed(2)} ${(100 - allInEvAt(x) * 100).toFixed(2)}`
}).join(' ')

/**
 * A throwaway prototype of the Landing to come: one Hand played in a
 * 3D scene, stop by stop. The page is one screen per stop and
 * snaps to them; each scroll moves on one, and the story plays up to it at
 * its own pace rather than the finger's. Here to judge rhythm and framing on
 * real screens before it takes the Landing's place; it is not linked from anywhere.
 */
export function LandingLabPage() {
  const { t, formatNumber } = useI18n()
  const bigBlinds = (value: number) => t('room.table.bigBlinds', { value: formatNumber(value, { signDisplay: 'exceptZero' }) })
  const figures = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const copy = useRef<HTMLDivElement>(null)
  const readout = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const left = new AbortController()
    let dispose = () => {}
    let setProgress = (_progress: number) => {}

    // One picture per stop, and no glide between them, for whoever asked for less motion or can't run the scene.
    // The lab alone takes a tier by hand, `?tier=still`, to look at each on any machine.
    const asked = new URLSearchParams(window.location.search).get('tier')
    const device = {
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      cores: navigator.hardwareConcurrency,
      memory: (navigator as { deviceMemory?: number }).deviceMemory,
    }
    let tier: Tier = asked === 'high' || asked === 'medium' || asked === 'still' ? asked : tierFor(device)

    let playhead = 0
    let frame = 0
    let last = 0

    /** The stop the page is scrolled to: its screens are all the same height. */
    const screen = () => document.documentElement.scrollHeight / stops.length
    const stopAt = () => {
      const stop = Math.round(window.scrollY / screen())
      return Number.isFinite(stop) ? Math.min(stops.length - 1, Math.max(0, stop)) : 0
    }
    const show = () => {
      setProgress(playhead)
      copy.current?.querySelectorAll<HTMLElement>('[data-caption]').forEach((element) => {
        const showing = captionAt(element.dataset.caption as Caption, playhead)
        element.style.opacity = String(showing)
        element.style.visibility = showing > 0 ? 'visible' : 'hidden'
      })
      if (readout.current) readout.current.textContent = `${(playhead * 100).toFixed(1)} %`
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
    window.addEventListener('touchstart', (event) => (touchedAt = event.touches[0].clientY), {
      signal: left.signal,
      passive: true,
    })
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
        if (!by || event.target instanceof HTMLAnchorElement) return
        event.preventDefault()
        heldUntil = 0
        step(by)
      },
      { signal: left.signal },
    )

    // The scene and three.js come after the copy and the two ways on, in their own chunk.
    void import('./scene/LandingScene').then(({ mountLandingScene }) => {
      if (left.signal.aborted || !canvas.current) return
      try {
        const scene = mountLandingScene(canvas.current, {
          tier,
          depthOfField: depthOfFieldFor(tier, device),
          onTier: (lower) => (tier = lower),
          // The Results Graph's figures, laid where the graph of chips is on screen.
          onGraph({ showing, left, right, zero, crest, floor }) {
            const style = figures.current?.style
            if (!style) return
            style.opacity = String(showing)
            style.visibility = showing > 0 ? 'visible' : 'hidden'
            style.setProperty('--left', `${left}px`)
            style.setProperty('--width', `${right - left}px`)
            style.setProperty('--zero', `${zero}px`)
            style.setProperty('--crest', `${crest}px`)
            style.setProperty('--floor', `${floor}px`)
          },
        })
        setProgress = scene.setProgress
        dispose = scene.dispose
        canvas.current.dataset.ready = 'true'
        show()
      } catch {
        // No WebGL: the copy and the two ways on stand on the dark alone.
      }
    })

    return () => {
      left.abort()
      cancelAnimationFrame(frame)
      dispose()
    }
  }, [])

  return (
    <main className="landing-lab" data-theme="dark">
      {stops.map(({ at }) => (
        <div key={at} className="landing-lab__stop" />
      ))}

      <canvas ref={canvas} className="landing-lab__scene" aria-hidden="true" />

      {/* The one moment of the app itself: the Results Graph's rules, figures and legend, round the graph of chips. */}
      <div ref={figures} className="landing-lab__figures" aria-hidden="true">
        <ul className="landing-lab__legend">
          <li>
            <span className="landing-lab__swatch landing-lab__swatch--result" />
            {t('library.results.line.result')}
            <b className="ro-mono">{bigBlinds(totalOf(resultAt))}</b>
          </li>
          <li>
            <span className="landing-lab__swatch landing-lab__swatch--ev" />
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
            className="landing-lab__rule ro-mono"
            style={{ '--up': figure / sampleResults.crest } as CSSProperties}
          >
            {formatNumber(figure, { notation: 'compact', maximumFractionDigits: 1, signDisplay: 'exceptZero' })}
          </span>
        ))}
        <svg className="landing-lab__ev" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d={allInEvPath} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="landing-lab__hands ro-mono">{t('library.results.hand', { hand: 1 })}</span>
        <span className="landing-lab__hands landing-lab__hands--last ro-mono">
          {formatNumber(sampleResults.hands, { useGrouping: true })}
        </span>
      </div>

      <header className="landing-lab__bar">
        <div className="landing-lab__brand">
          <Brand size="landing" />
          <span className="landing-lab__beta ro-mono">{t('brand.beta')}</span>
        </div>
        <nav className="landing-lab__doors">
          <a href={enterRoomPath} className="landing-lab__code" onClick={followLink}>
            {t('landing.haveCode')}
          </a>
          <a href={loginPath} className="ro-btn ro-btn--primary" onClick={followLink}>
            {t('landing.signIn')}
          </a>
        </nav>
      </header>

      <div ref={copy} className="landing-lab__copy">
        {captions.map((caption) => (
          <div key={caption} className="landing-lab__caption" data-caption={caption}>
            {caption === 'opening' ? (
              <h1 className="landing-lab__title ro-serif">{t('landing.opening.title')}</h1>
            ) : (
              <h2 className="landing-lab__title ro-serif">{t(`landing.${caption}.title`)}</h2>
            )}
            <p className="landing-lab__line">{t(`landing.${caption}.line`)}</p>
            {caption === 'opening' && <p className="landing-lab__hint ro-mono">{t('landing.scrollHint')}</p>}
            {caption === 'rooms' && <p className="landing-lab__hint ro-mono">{t('landing.close.title')}</p>}
          </div>
        ))}
      </div>

      <span ref={readout} className="landing-lab__readout ro-mono" aria-hidden="true" />
    </main>
  )
}
