import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { Button } from '../ui/Button'
import { SessionContext } from './context'
import { loadSession, type Session } from './identity'
import './SessionProvider.css'

type Loading = { state: 'loading' } | { state: 'ready'; session: Session } | { state: 'error' }

/** Renders its children once this browser's identity is known. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [loading, setLoading] = useState<Loading>({ state: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadSession()
      .then((session) => !cancelled && setLoading({ state: 'ready', session }))
      .catch(() => !cancelled && setLoading({ state: 'error' }))
    return () => {
      cancelled = true
    }
  }, [attempt])

  const rememberDisplayName = useCallback((displayName: string) => {
    setLoading((current) =>
      current.state === 'ready'
        ? { state: 'ready', session: { ...current.session, identity: { ...current.session.identity, displayName } } }
        : current,
    )
  }, [])

  const value = useMemo(
    () => (loading.state === 'ready' ? { ...loading.session, rememberDisplayName } : null),
    [loading, rememberDisplayName],
  )

  if (loading.state === 'loading') {
    return (
      <main className="session-gate" aria-busy="true">
        <p>{t('identity.loading')}</p>
      </main>
    )
  }
  if (!value) {
    return (
      <main className="session-gate">
        <p role="alert">{t('identity.error')}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setLoading({ state: 'loading' })
            setAttempt((n) => n + 1)
          }}
        >
          {t('identity.retry')}
        </Button>
      </main>
    )
  }
  return <SessionContext value={value}>{children}</SessionContext>
}
