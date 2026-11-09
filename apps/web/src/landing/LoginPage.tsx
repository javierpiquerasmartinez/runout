import { useI18n } from '../i18n'
import { GoogleSignInButton } from '../identity/GoogleSignInButton'
import { PasswordSignIn } from '../identity/PasswordSignIn'
import { followLink } from '../routing'
import { Brand } from '../ui/Brand'
import { Icon } from '../ui/Icon'
import './LoginPage.css'

/** The sign-in screen: Google, or an email and its password. */
export const loginPath = '/login'

/**
 * `/login`: the brand, Google's button, the password form and the way back
 * to the landing. Runout is invitation-only, and it says so. Once signed in,
 * `routes/Routes` takes the Account to its Home.
 */
export function LoginPage() {
  const { t } = useI18n()
  return (
    <main className="login" aria-label={t('login.title')}>
      <div className="login__card">
        <Brand size="landing" />
        <p className="login__invitation-only">{t('login.invitationOnly')}</p>
        <GoogleSignInButton />
        <div className="login__or" aria-hidden="true">
          <span>{t('login.or')}</span>
        </div>
        <PasswordSignIn />
        <a href="/" className="login__back" onClick={followLink}>
          <Icon name="chevron" size={14} className="login__back-icon" />
          {t('login.back')}
        </a>
      </div>
    </main>
  )
}
