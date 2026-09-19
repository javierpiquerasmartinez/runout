import { useI18n } from '../i18n'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'

/*
 * The right half of the "Bienvenida" board: a still of a Room in progress and
 * the three things Runout does. Purely illustrative, so hidden from assistive tech
 * except for the feature list.
 */

const suits = {
  spade:
    'M12 2.5S4 8 4 12.7c0 2.6 1.9 4.3 4.1 4.3 1.3 0 2.3-.5 3-1.3-.2 1.9-.9 3.4-2.1 4.3h6c-1.2-.9-1.9-2.4-2.1-4.3.7.8 1.7 1.3 3 1.3 2.2 0 4.1-1.7 4.1-4.3C20 8 12 2.5 12 2.5z',
  heart:
    'M12 21S3 14.5 3 8.8C3 5.6 5.4 3.5 8.1 3.5c1.7 0 3.1.8 3.9 2.1.8-1.3 2.2-2.1 3.9-2.1C18.6 3.5 21 5.6 21 8.8 21 14.5 12 21 12 21z',
  diamond: 'M12 2.5 20 12l-8 9.5L4 12z',
} as const

const board = [
  { rank: 'K', suit: 'spade' },
  { rank: '9', suit: 'heart' },
  { rank: '4', suit: 'diamond' },
] as const

const people = ['Javier P', 'Marta R', 'Alberto L', 'David V']

export function WelcomePreview() {
  const { t, formatNumber } = useI18n()
  return (
    <section className="welcome-preview">
      <div className="welcome-preview__room" aria-hidden="true">
        <div className="welcome-preview__bar">
          <span className="welcome-preview__synced">
            <span className="welcome-preview__dot" />
            {t('welcome.preview.synced', { count: 4 })}
          </span>
          <span className="welcome-preview__hand ro-mono">{t('welcome.preview.hand', { current: 7, total: 18 })}</span>
          <span className="ro-avatar-stack welcome-preview__people">
            {people.map((name, index) => (
              <Avatar key={name} name={name} seed={String(index)} size={24} />
            ))}
          </span>
        </div>

        <div className="welcome-preview__felt">
          <div className="welcome-preview__table">
            <div className="welcome-preview__board">
              {board.map((card) => (
                <span key={card.rank} className="welcome-preview__card" data-suit={card.suit}>
                  <span className="ro-mono">{card.rank}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d={suits[card.suit]} fill="currentColor" />
                  </svg>
                </span>
              ))}
              <span className="welcome-preview__card welcome-preview__card--empty" />
              <span className="welcome-preview__card welcome-preview__card--empty" />
            </div>
            <div className="welcome-preview__pot">
              <span className="ro-mono">{t('welcome.preview.pot')}</span>
              <span className="ro-mono">{t('welcome.preview.potValue', { value: formatNumber(24.5) })}</span>
            </div>
          </div>
        </div>

        <div className="welcome-preview__streets">
          {[true, true, false, false, false].map((reached, index) => (
            <span key={index} data-reached={reached || undefined} />
          ))}
        </div>
      </div>

      <ul className="welcome-features">
        <li>
          <Icon name="import" size={20} />
          <strong>{t('welcome.feature.import.title')}</strong>
          <span>{t('welcome.feature.import.body')}</span>
        </li>
        <li>
          <Icon name="menu" size={20} />
          <strong>{t('welcome.feature.queue.title')}</strong>
          <span>{t('welcome.feature.queue.body')}</span>
        </li>
        <li>
          <Icon name="history" size={20} />
          <strong>{t('welcome.feature.live.title')}</strong>
          <span>{t('welcome.feature.live.body')}</span>
        </li>
      </ul>
    </section>
  )
}
