import { useEffect, useRef, type CSSProperties } from 'react'
import { useI18n } from '../i18n'
import { loginPath } from '../identity/accessPaths'
import { enterRoomPath } from '../room/roomCode'
import { followLink } from '../routing'
import { Brand } from '../ui/Brand'
import { stops, type Caption } from './scene/choreography'
import { allInEvAt, sampleResults, totalOf, winRateOf, resultAt } from './scene/sampleResults'
import { tellStory } from './story'
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
 * pace rather than the finger's: `story.ts` tells it. Signing in and
 * bringing a Room Code are in a bar that never leaves the top. An Account
 * never sees it: `/` is its Home.
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
    if (!page.current || !copy.current || !canvas.current || !still.current || !figures.current) return
    const leaving = new AbortController()
    tellStory(
      { page: page.current, copy: copy.current, canvas: canvas.current, still: still.current, figures: figures.current },
      leaving.signal,
    )
    return () => leaving.abort()
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
