import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, detailOf, reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { homePath } from '../home/home'
import { Redirect } from '../routes/Redirect'
import { Brand } from '../ui/Brand'
import { Button } from '../ui/Button'
import { useSession } from './context'
import { GoogleSignInButton } from './GoogleSignInButton'
import type { Session } from './identity'
import { NewPasswordField } from './PasswordField'
import './InvitationPage.css'

type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled'

type Load =
  | { state: 'loading' }
  | { state: 'found'; email: string; status: InvitationStatus }
  | { state: 'failed'; reason: FailureReason }

/**
 * `/invitation/<token>`: an Invitation's link. It shows the invited email and
 * lets them create their Account with Google or a password; then they choose
 * their Display Name (`FirstDisplayName`) and land on their Home. A link
 * that can no longer be used says why.
 */
export function InvitationPage({ token }: { token: string }) {
  const { t } = useI18n()
  const session = useSession()
  const [load, setLoad] = useState<Load>({ state: 'loading' })

  useEffect(() => {
    let cancelled = false
    api<{ email: string; status: InvitationStatus }>(`/invitations/${encodeURIComponent(token)}`)
      .then((found) => !cancelled && setLoad({ state: 'found', ...found }))
      .catch((error: unknown) => !cancelled && setLoad({ state: 'failed', reason: reasonOf(error) }))
    return () => {
      cancelled = true
    }
  }, [token])

  if (load.state === 'loading') return <InvitationCard busy />
  if (load.state === 'failed') {
    return (
      <InvitationCard>
        <h1 className="invitation__title ro-serif">{t('invitation.unusable.title')}</h1>
        <p role="alert">
          {load.reason === 'invitation-not-found' ? t('invitation.unusable.not-found') : t(`reason.${load.reason}`)}
        </p>
        <p className="invitation__hint">{t('invitation.unusable.askAgain')}</p>
      </InvitationCard>
    )
  }
  const signedInAs = session.identity?.account?.email ?? null
  // Accepted just now, or opened again by its own Account: on to Home.
  if (signedInAs === load.email) return <Redirect to={homePath} />
  if (load.status !== 'pending') {
    return (
      <InvitationCard>
        <h1 className="invitation__title ro-serif">{t('invitation.unusable.title')}</h1>
        <p role="alert">{t(`invitation.unusable.${load.status}`)}</p>
        <p className="invitation__hint">{t('invitation.unusable.askAgain')}</p>
      </InvitationCard>
    )
  }
  if (signedInAs !== null) return <SignedInAsSomeoneElse email={load.email} />
  return <Accept token={token} email={load.email} />
}

function InvitationCard({ busy, children }: { busy?: boolean; children?: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <main className="invitation" aria-label={t('invitation.title')} aria-busy={busy || undefined}>
      <div className="invitation__card">
        <Brand size="landing" />
        {children}
      </div>
    </main>
  )
}

/** Someone signed in with another Account opened it: it isn't theirs to attach. */
function SignedInAsSomeoneElse({ email }: { email: string }) {
  const { t } = useI18n()
  const { signOut } = useSession()
  const [busy, setBusy] = useState(false)
  return (
    <InvitationCard>
      <h1 className="invitation__title ro-serif">{t('invitation.title')}</h1>
      <p role="alert">{t('invitation.forSomeoneElse', { email })}</p>
      <Button
        variant="primary"
        aria-busy={busy}
        onClick={() => {
          setBusy(true)
          void signOut().finally(() => setBusy(false))
        }}
      >
        {t('invitation.signOutToContinue')}
      </Button>
    </InvitationCard>
  )
}

function Accept({ token, email }: { token: string; email: string }) {
  const { t } = useI18n()
  const { adopt } = useSession()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const describe = useCallback(
    (error: unknown) => {
      const reason = reasonOf(error)
      if (reason === 'invitation-email-mismatch') {
        return t('invitation.googleMismatch', { email: detailOf(error, 'email') ?? email })
      }
      return t(`reason.${reason}`)
    },
    [t, email],
  )

  const acceptWithGoogle = useCallback(
    (idToken: string) => {
      setFailure(null)
      api<Session>(`/invitations/${encodeURIComponent(token)}/google`, { method: 'POST', body: { idToken } })
        .then(adopt)
        .catch((error: unknown) => setFailure(describe(error)))
    },
    [token, adopt, describe],
  )

  async function acceptWithPassword(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFailure(null)
    try {
      adopt(await api<Session>(`/invitations/${encodeURIComponent(token)}/password`, { method: 'POST', body: { password } }))
    } catch (error) {
      setFailure(describe(error))
      setBusy(false)
    }
  }

  return (
    <InvitationCard>
      <div className="invitation__heading">
        <h1 className="invitation__title ro-serif">{t('invitation.title')}</h1>
        <p>{t('invitation.body')}</p>
        <p className="invitation__email ro-mono">{email}</p>
      </div>
      <GoogleSignInButton label="continue" onCredential={acceptWithGoogle} />
      <div className="invitation__or" aria-hidden="true">
        <span>{t('login.or')}</span>
      </div>
      <form className="invitation__form" onSubmit={acceptWithPassword} noValidate aria-label={t('invitation.password.title')}>
        <NewPasswordField label={t('invitation.password.label')} value={password} onChange={setPassword} />
        <Button type="submit" variant="primary" size="prominent" aria-busy={busy}>
          {t('invitation.password.submit')}
        </Button>
      </form>
      {failure && (
        <p className="invitation__error" role="alert">
          {failure}
        </p>
      )}
    </InvitationCard>
  )
}
