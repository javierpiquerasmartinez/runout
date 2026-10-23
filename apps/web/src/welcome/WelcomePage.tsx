import { useI18n } from '../i18n'
import { useSession } from '../identity/context'
import { libraryPath } from '../library/library'
import { RecentRooms, RoomForms } from '../rooms/RoomForms'
import { followLink } from '../routing'
import { BrandMark } from '../ui/BrandMark'
import { Icon } from '../ui/Icon'
import { WelcomePreview } from './WelcomePreview'
import './WelcomePage.css'

export function WelcomePage() {
  const { t } = useI18n()
  const { token, identity } = useSession()
  return (
    <main className="welcome">
      <div className="welcome__entry">
        <div className="welcome__brand">
          <BrandMark />
          <span className="welcome__wordmark ro-serif">{t('brand.wordmark')}</span>
          <span className="welcome__beta ro-mono">{t('brand.beta')}</span>
          {/* Only an Account has a Library (ADR 0005). */}
          {identity?.account && (
            <a href={libraryPath} className="welcome__library" onClick={followLink}>
              <Icon name="library" size={16} />
              {t('welcome.library')}
            </a>
          )}
        </div>

        <div className="welcome__intro">
          <h1 className="welcome__title ro-serif">{t('welcome.title')}</h1>
          <p className="welcome__lead">{t('welcome.lead')}</p>
        </div>

        <RoomForms />

        {/* An anonymous identity only ever has its own Room: the list is for Accounts. */}
        {identity?.account && <RecentRooms token={token} />}
      </div>

      <WelcomePreview />
    </main>
  )
}
