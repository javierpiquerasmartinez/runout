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
            <a className="ro-touch-target" href={href} onClick={followLink}>
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

/** What leads from a card to another screen: a plain link, or one drawn as a secondary compact button. */
export function HomeCardLink({
  href,
  look = 'text',
  className,
  children,
}: {
  href: string
  look?: 'text' | 'button'
  className?: string
  children: ReactNode
}) {
  const drawnAs = look === 'button' ? 'ro-btn ro-btn--secondary ro-btn--compact home-card__link' : 'home-card__text-link ro-touch-target'
  return (
    <a className={className ? `${drawnAs} ${className}` : drawnAs} href={href} onClick={followLink}>
      {children}
    </a>
  )
}
