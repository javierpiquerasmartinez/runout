import { useI18n } from '../i18n'
import { enterRoomPath } from '../room/roomCode'
import { followLink } from '../routing'
import { Brand } from '../ui/Brand'
import { loginPath } from './LoginPage'
import './LandingPage.css'

/**
 * `/` for a visitor: what Runout is, and the two ways on, signing in or
 * bringing a Room Code. A placeholder until the landing is designed.
 */
export function LandingPage() {
  const { t } = useI18n()
  return (
    <main className="landing">
      <div className="landing__brand">
        <Brand size="landing" />
        <span className="landing__beta ro-mono">{t('brand.beta')}</span>
      </div>

      <div className="landing__intro">
        <h1 className="landing__title ro-serif">{t('landing.title')}</h1>
        <p className="landing__lead">{t('landing.lead')}</p>
      </div>

      <div className="landing__actions">
        <a href={loginPath} className="ro-btn ro-btn--primary ro-btn--prominent landing__link" onClick={followLink}>
          {t('landing.signIn')}
        </a>
        <a href={enterRoomPath} className="landing__code" onClick={followLink}>
          {t('landing.haveCode')}
        </a>
      </div>
    </main>
  )
}
