import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../backend/api'
import { useI18n } from '../i18n'
import { PreferencesContext } from '../preferences/context'
import { DEFAULT_PREFERENCES, type Preferences } from '../preferences/preferences'
import { useTheme } from '../preferences/theme'
import { Button } from '../ui/Button'
import { SessionContext } from './context'
import { loadSession, type Session } from './identity'
import './SessionProvider.css'

type Loading = { state: 'loading' } | { state: 'ready'; session: Session } | { state: 'error' }

/**
 * Renders its children once this browser's identity is known, read the way
 * that identity prefers: theme, language, deck and units.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { t, setLocale } = useI18n()
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

  const remember = useCallback((changes: Partial<Session['identity']>) => {
    setLoading((current) =>
      current.state === 'ready'
        ? { state: 'ready', session: { ...current.session, identity: { ...current.session.identity, ...changes } } }
        : current,
    )
  }, [])
  const rememberDisplayName = useCallback((displayName: string) => remember({ displayName }), [remember])
  const rememberScreenNames = useCallback((screenNames: string[]) => remember({ screenNames }), [remember])

  const token = loading.state === 'ready' ? loading.session.token : null
  const preferences = loading.state === 'ready' ? loading.session.identity.preferences : DEFAULT_PREFERENCES
  // Changes go to the server one after another, in the order they were made,
  // so a quick second change is never overwritten by the first arriving late.
  const [inOrder] = useState(oneAfterAnother)
  const changePreferences = useCallback(
    async (changes: Partial<Preferences>) => {
      if (token === null) return
      const updatePreferences = (update: (current: Preferences) => Preferences) =>
        setLoading((current) =>
          current.state === 'ready'
            ? {
                state: 'ready',
                session: {
                  ...current.session,
                  identity: { ...current.session.identity, preferences: update(current.session.identity.preferences) },
                },
              }
            : current,
        )
      let before: Preferences = DEFAULT_PREFERENCES
      updatePreferences((current) => {
        before = current
        return { ...current, ...changes }
      })
      try {
        await inOrder(() => api<Preferences>('/identities/me/preferences', { token, method: 'PATCH', body: changes }))
      } catch (error) {
        // Back to what it was, unless something changed it again meanwhile.
        updatePreferences((current) => {
          const reverted = { ...current }
          for (const key of Object.keys(changes) as (keyof Preferences)[]) {
            if (current[key] === changes[key]) Object.assign(reverted, { [key]: before[key] })
          }
          return reverted
        })
        throw error
      }
    },
    [token, inOrder],
  )

  useTheme(preferences.theme)
  useEffect(() => setLocale(preferences.language), [preferences.language, setLocale])

  const value = useMemo(
    () =>
      loading.state === 'ready'
        ? { ...loading.session, rememberDisplayName, rememberScreenNames, changePreferences }
        : null,
    [loading, rememberDisplayName, rememberScreenNames, changePreferences],
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
  return (
    <SessionContext value={value}>
      <PreferencesContext value={preferences}>{children}</PreferencesContext>
    </SessionContext>
  )
}

/** Runs each task once every task given before it has settled, whatever its outcome. */
function oneAfterAnother(): <T>(task: () => Promise<T>) => Promise<T> {
  let last: Promise<unknown> = Promise.resolve()
  return (task) => {
    const next = last.catch(() => {}).then(task)
    last = next
    return next
  }
}
