import { useState, type FormEvent } from 'react'
import { detailOf, reasonOf } from '../backend/api'
import { useI18n } from '../i18n'
import { followLink } from '../routing'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'
import { resetPasswordPath } from './accessPaths'
import { useSession } from './context'
import './PasswordSignIn.css'

/**
 * Signing in with an email and its password, under Google's button. A wrong
 * pair, whichever half is wrong, gets the same answer; after too many it says
 * how long to wait.
 */
export function PasswordSignIn() {
  const { t, formatRelative } = useI18n()
  const { signInWithPassword } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFailure(null)
    try {
      await signInWithPassword(email, password)
    } catch (error) {
      const reason = reasonOf(error)
      const retryAt = detailOf(error, 'retryAt')
      setFailure(
        reason === 'too-many-attempts' && retryAt
          ? t('login.password.wait', { when: formatRelative(new Date(retryAt)) })
          : t(`reason.${reason}`),
      )
      setBusy(false)
    }
  }

  return (
    <form className="password-sign-in" onSubmit={submit} noValidate aria-label={t('login.password.title')}>
      <TextField
        label={t('login.password.email')}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <TextField
        label={t('login.password.password')}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      {failure && (
        <p className="password-sign-in__error" role="alert">
          {failure}
        </p>
      )}
      <Button type="submit" variant="primary" size="prominent" aria-busy={busy}>
        {t('login.password.submit')}
      </Button>
      <a href={resetPasswordPath} className="password-sign-in__forgot" onClick={followLink}>
        {t('login.password.forgot')}
      </a>
    </form>
  )
}
