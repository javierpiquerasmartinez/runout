import { useState, type FormEvent } from 'react'
import { api, reasonOf } from '../backend/api'
import { useI18n } from '../i18n'
import { loginPath } from '../landing/LoginPage'
import { followLink } from '../routing'
import { Brand } from '../ui/Brand'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { TextField } from '../ui/TextField'
import { useSession } from './context'
import type { Session } from './identity'
import { NewPasswordField } from './PasswordField'
import '../landing/LoginPage.css'
import './InvitationPage.css'

/**
 * `/reset-password`: asks for an email and always answers the same, whether
 * it has an Account or not, so the form gives nothing away.
 */
export function RequestResetPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFailure(null)
    try {
      await api('/password-resets', { method: 'POST', body: { email } })
      setSent(true)
    } catch (error) {
      setFailure(t(`reason.${reasonOf(error)}`))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="invitation" aria-label={t('reset.title')}>
      <div className="invitation__card">
        <Brand size="landing" />
        <div className="invitation__heading">
          <h1 className="invitation__title ro-serif">{t('reset.title')}</h1>
          <p>{t('reset.body')}</p>
        </div>
        {sent ? (
          <p role="status">{t('reset.sent')}</p>
        ) : (
          <form className="invitation__form" onSubmit={submit} noValidate>
            <TextField
              label={t('login.password.email')}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button type="submit" variant="primary" size="prominent" aria-busy={busy}>
              {t('reset.send')}
            </Button>
          </form>
        )}
        {failure && (
          <p className="invitation__error" role="alert">
            {failure}
          </p>
        )}
        <BackToSignIn />
      </div>
    </main>
  )
}

/**
 * `/reset-password/<token>`: the emailed link. The new password follows the
 * same rules as any; once set, every other browser is signed out and this one
 * is signed in.
 */
export function CompleteResetPage({ token }: { token: string }) {
  const { t } = useI18n()
  const { adopt } = useSession()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFailure(null)
    try {
      adopt(await api<Session>(`/password-resets/${encodeURIComponent(token)}`, { method: 'POST', body: { password } }))
    } catch (error) {
      setFailure(t(`reason.${reasonOf(error)}`))
      setBusy(false)
    }
  }

  return (
    <main className="invitation" aria-label={t('reset.complete.title')}>
      <div className="invitation__card">
        <Brand size="landing" />
        <h1 className="invitation__title ro-serif">{t('reset.complete.title')}</h1>
        <form className="invitation__form" onSubmit={submit} noValidate>
          <NewPasswordField label={t('reset.complete.label')} value={password} onChange={setPassword} />
          <Button type="submit" variant="primary" size="prominent" aria-busy={busy}>
            {t('reset.complete.submit')}
          </Button>
        </form>
        {failure && (
          <p className="invitation__error" role="alert">
            {failure}
          </p>
        )}
        <BackToSignIn />
      </div>
    </main>
  )
}

function BackToSignIn() {
  const { t } = useI18n()
  return (
    <a href={loginPath} className="login__back" onClick={followLink}>
      <Icon name="chevron" size={14} className="login__back-icon" />
      {t('reset.backToSignIn')}
    </a>
  )
}
