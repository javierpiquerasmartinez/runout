import type { AriaRole, ReactNode } from 'react'
import { useI18n } from '../i18n'
import { followLink } from '../routing'
import { Button } from '../ui/Button'
import './HomeCard.css'

export type CardStatus = 'loading' | 'loaded' | 'failed'

/**
 * What every card of Home shares: its head (the title, leading to the section)
 * and the states of its read. `children`, the subtitle's place and `action`
 * belong to the card; while it loads or has failed the shell shows its own body
 * and no action, and only a loading card keeps its subtitle, as the boards draw.
 * Feed `status` and `onRetry` from `useCardRead`, or from the section's own hook.
 */
export function HomeCard({
  title,
  href,
  status,
  onRetry,
  subtitle,
  action,
  children,
}: {
  title: string
  href: string
  status: CardStatus
  onRetry: () => void
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <section className="home-card" aria-label={title}>
      <div className="home-card__head">
        <div className="home-card__heading">
          <h2 className="home-card__title">
            <a href={href} onClick={followLink}>
              {title}
            </a>
          </h2>
          {subtitle && status !== 'failed' && <span className="home-card__subtitle ro-mono">{subtitle}</span>}
        </div>
        {status === 'loaded' && action}
      </div>
      {status === 'loading' && (
        <div className="home-card__loading" aria-busy="true">
          <div className="home-card__placeholder home-card__placeholder--line" aria-hidden="true" />
          <div className="home-card__placeholder home-card__placeholder--block" aria-hidden="true" />
        </div>
      )}
      {status === 'failed' && (
        <HomeCardMessage role="alert" title={t('home.failed.title')} text={t('home.failed.text')}>
          <Button size="compact" onClick={onRetry}>
            {t('home.retry')}
          </Button>
        </HomeCardMessage>
      )}
      {status === 'loaded' && children}
    </section>
  )
}

/** A card's body when it has nothing to show: what happened, what it means, and what can be done. */
export function HomeCardMessage({
  title,
  text,
  role,
  children,
}: {
  title: string
  text: string
  role?: AriaRole
  children?: ReactNode
}) {
  return (
    <div className="home-card__message" role={role}>
      <p className="home-card__message-title">{title}</p>
      <p className="home-card__message-text">{text}</p>
      {children}
    </div>
  )
}

/** A secondary compact button that leads to another screen. */
export function HomeCardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="ro-btn ro-btn--secondary ro-btn--compact home-card__link" href={href} onClick={followLink}>
      {children}
    </a>
  )
}
