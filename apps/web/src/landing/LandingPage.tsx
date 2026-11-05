import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type RefObject } from 'react'
import { useI18n } from '../i18n'
import { enterRoomPath } from '../room/roomCode'
import { followLink } from '../routing'
import { Brand } from '../ui/Brand'
import { loginPath } from './LoginPage'
import { story, videoTimeAt } from './scrollStory'
import './LandingPage.css'

/** The landing's clip, re-encoded for scrubbing by `scripts/landing-trails.sh`. */
const landingClip = {
  webm: '/landing-trails.webm',
  mp4: '/landing-trails.mp4',
  poster: '/landing-trails-poster.jpg',
  table: '/landing-trails-table.jpg',
}

/**
 * `/` for a visitor: a short story told over a video the scroll drives. A
 * golden ribbon waves like a Results Graph, plunges into one place and draws
 * a poker table, while the copy says what Runout does: Results, the Library,
 * Rooms. It closes on the lit table with the two ways on, signing in or
 * bringing a Room Code. Provisional, until the definitive landing is designed.
 */
export function LandingPage() {
  const { t } = useI18n()
  const reducedMotion = usePrefersReducedMotion()
  const close = useRef<HTMLElement>(null)

  return (
    <main className="landing" data-theme="dark">
      <div className="landing__stage" aria-hidden="true">
        {reducedMotion ? (
          <img className="landing__frame" src={landingClip.table} alt="" />
        ) : (
          <ScrubbedVideo scrollEnd={close} />
        )}
        <div className="landing__veil" />
      </div>

      <div className="landing__story">
        {story.map(({ section, screens }) => {
          const height = { '--landing-screens': screens } as CSSProperties
          switch (section) {
            case 'opening':
              return (
                <section key={section} className="landing__section" style={height}>
                  <div className="landing__pinned">
                    <div className="landing__brand">
                      <Brand size="landing" />
                      <span className="landing__beta ro-mono">{t('brand.beta')}</span>
                    </div>
                    <div className="landing__copy">
                      <h1 className="landing__title ro-serif">{t('landing.opening.title')}</h1>
                      <p className="landing__line">{t('landing.opening.line')}</p>
                    </div>
                    <p className="landing__hint ro-mono">{t('landing.scrollHint')}</p>
                  </div>
                </section>
              )
            case 'close':
              return (
                <section key={section} ref={close} className="landing__section landing__section--close" style={height}>
                  <div className="landing__table">
                    <div className="landing__close">
                      <h2 className="landing__close-title ro-serif">{t('landing.close.title')}</h2>
                      <div className="landing__actions">
                        <a
                          href={loginPath}
                          className="landing__sign-in ro-btn ro-btn--primary ro-btn--prominent"
                          onClick={followLink}
                        >
                          {t('landing.signIn')}
                        </a>
                        <a href={enterRoomPath} className="landing__code" onClick={followLink}>
                          {t('landing.haveCode')}
                        </a>
                      </div>
                    </div>
                  </div>
                </section>
              )
            default:
              return (
                <section key={section} className="landing__section" style={height}>
                  <div className="landing__pinned">
                    <div className="landing__copy">
                      <h2 className="landing__title ro-serif">{t(`landing.${section}.title`)}</h2>
                      <p className="landing__line">{t(`landing.${section}.line`)}</p>
                    </div>
                  </div>
                </section>
              )
          }
        })}
      </div>
    </main>
  )
}

/**
 * The clip, sought to the time the scroll asks for and never played: one
 * animation frame is scheduled whenever the scroll or the viewport changes,
 * or a seek ends, and that frame seeks once. The whole file is fetched into
 * memory first, since seeking in a file that is still streaming stutters;
 * until then the poster shows and the page scrolls as usual.
 *
 * Progress runs from the top of the page to the close's top reaching the top
 * of the screen, so it stays in `scrollStory`'s screens however tall the
 * viewport is while the browser's bars come and go.
 */
function ScrubbedVideo({ scrollEnd }: { scrollEnd: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const download = new AbortController()
    const listening = { signal: download.signal }
    let frame = 0
    let source: string | null = null

    const seek = () => {
      frame = 0
      if (element.seeking) return // `seeked` schedules the next one.
      const end = scrollEnd.current ? scrollEnd.current.getBoundingClientRect().top + window.scrollY : 0
      const time = videoTimeAt(end > 0 ? window.scrollY / end : 0)
      if (Math.abs(element.currentTime - time) > 1 / 48) element.currentTime = time
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(seek)
    }

    const url = element.canPlayType('video/webm; codecs="vp9"') ? landingClip.webm : landingClip.mp4
    fetch(url, listening)
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (download.signal.aborted || !blob) return
        source = URL.createObjectURL(blob)
        element.addEventListener(
          'loadeddata',
          () => {
            schedule()
            window.addEventListener('scroll', schedule, { ...listening, passive: true })
            window.addEventListener('resize', schedule, listening)
            element.addEventListener('seeked', schedule, listening)
          },
          { ...listening, once: true },
        )
        element.src = source
      })
      .catch(() => {
        // Left, or failed: the poster stays and the story still reads without the video.
      })

    return () => {
      download.abort() // Also takes off every listener added above.
      cancelAnimationFrame(frame)
      if (source) URL.revokeObjectURL(source)
    }
  }, [scrollEnd])

  return (
    <video
      ref={ref}
      className="landing__frame"
      poster={landingClip.poster}
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      tabIndex={-1}
    />
  )
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION)
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

function prefersReducedMotion() {
  return window.matchMedia?.(REDUCED_MOTION).matches ?? false
}

/** Whether the visitor's system asks for reduced motion, and keeps asking. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeToReducedMotion, prefersReducedMotion)
}
