import { useI18n } from '../i18n'
import { GoogleSignInButton } from '../identity/GoogleSignInButton'
import { followLink } from '../routing'
import { Brand } from '../ui/Brand'
import { Icon } from '../ui/Icon'
import './LoginPage.css'

/** The sign-in screen, where Google is the only way in. */
export const loginPath = '/login'

/**
 * `/login`: the brand, Google's button and the way back to the landing.
 * Once signed in, `routes/Routes` takes the new Account to its Library.
 */
export function LoginPage() {
  const { t } = useI18n()
  return (
    <main className="login" aria-label={t('login.title')}>
      <div className="login__card">
        <Brand size="landing" />
        <GoogleSignInButton />
        <a href="/" className="login__back" onClick={followLink}>
          <Icon name="chevron" size={14} className="login__back-icon" />
          {t('login.back')}
        </a>
      </div>
    </main>
  )
}
