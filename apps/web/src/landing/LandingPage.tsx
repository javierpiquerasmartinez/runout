import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { enterRoomPath } from '../room/roomCode'
import { followLink } from '../routing'
import { Brand } from '../ui/Brand'
import { loginPath } from './LoginPage'
import { story, videoTimeAt, type StorySection } from './scrollStory'
import './LandingPage.css'

/** The landing's clip, re-encoded for scrubbing by `scripts/landing-trails.sh`. */
const video = {
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

  return (
    <main className="landing">
      <div className="landing__stage" aria-hidden="true">
        {reducedMotion ? (
          <img className="landing__frame" src={video.table} alt="" />
        ) : (
          <ScrubbedVideo />
        )}
        <div className="landing__veil" />
      </div>

      <div className="landing__story">
        <Section section="opening">
          <div className="landing__brand">
            <Brand size="landing" />
            <span className="landing__beta ro-mono">{t('brand.beta')}</span>
          </div>
          <div className="landing__copy">
            <h1 className="landing__title ro-serif">{t('landing.opening.title')}</h1>
            <p className="landing__line">{t('landing.opening.line')}</p>
          </div>
          <p className="landing__hint ro-mono">{t('landing.scrollHint')}</p>
        </Section>

        <Section section="results">
          <div className="landing__copy">
            <h2 className="landing__title ro-serif">{t('landing.results.title')}</h2>
            <p className="landing__line">{t('landing.results.line')}</p>
          </div>
        </Section>

        <Section section="library">
          <div className="landing__copy">
            <h2 className="landing__title ro-serif">{t('landing.library.title')}</h2>
            <p className="landing__line">{t('landing.library.line')}</p>
          </div>
        </Section>

        <Section section="rooms">
          <div className="landing__copy">
            <h2 className="landing__title ro-serif">{t('landing.rooms.title')}</h2>
            <p className="landing__line">{t('landing.rooms.line')}</p>
          </div>
        </Section>

        <section className="landing__section landing__section--close">
          <div className="landing__close">
            <h2 className="landing__close-title ro-serif">{t('landing.close.title')}</h2>
            <div className="landing__actions">
              <a href={loginPath} className="ro-btn ro-btn--primary ro-btn--prominent" onClick={followLink}>
                {t('landing.signIn')}
              </a>
              <a href={enterRoomPath} className="landing__code" onClick={followLink}>
                {t('landing.haveCode')}
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

/** A section of the story, as tall as `scrollStory` says, its copy held on screen while it scrolls by. */
function Section({ section, children }: { section: Exclude<StorySection, 'close'>; children: ReactNode }) {
  const screens = story.find((entry) => entry.section === section)?.screens ?? 1
  return (
    <section
      className={`landing__section landing__section--${section}`}
      style={{ '--landing-screens': screens } as CSSProperties}
    >
      <div className="landing__pinned">{children}</div>
    </section>
  )
}

/**
 * The clip, sought on every animation frame to the time the scroll asks for
 * and never played. The whole file is fetched into memory first, since
 * seeking in a file that is still streaming stutters; until then the poster
 * shows and the page scrolls as usual.
 */
function ScrubbedVideo() {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const download = new AbortController()
    let frame = 0
    let source: string | null = null

    const follow = () => {
      const range = document.documentElement.scrollHeight - window.innerHeight
      const time = videoTimeAt(range > 0 ? window.scrollY / range : 0)
      if (!element.seeking && Math.abs(element.currentTime - time) > 1 / 48) element.currentTime = time
      frame = requestAnimationFrame(follow)
    }

    const url = element.canPlayType('video/webm; codecs="vp9"') ? video.webm : video.mp4
    fetch(url, { signal: download.signal })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (download.signal.aborted || !blob) return
        source = URL.createObjectURL(blob)
        element.src = source
        element.addEventListener('loadeddata', () => {
          if (!download.signal.aborted) frame = requestAnimationFrame(follow)
        }, { once: true })
      })
      .catch(() => {
        // Left, or failed: the poster stays and the story still reads without the video.
      })

    return () => {
      download.abort()
      cancelAnimationFrame(frame)
      if (source) URL.revokeObjectURL(source)
    }
  }, [])

  return (
    <video
      ref={ref}
      className="landing__frame"
      poster={video.poster}
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      tabIndex={-1}
    />
  )
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/** Whether the visitor's system asks for reduced motion, and keeps asking. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (changed) => {
      const query = window.matchMedia?.(REDUCED_MOTION)
      query?.addEventListener('change', changed)
      return () => query?.removeEventListener('change', changed)
    },
    () => window.matchMedia?.(REDUCED_MOTION).matches ?? false,
  )
}
