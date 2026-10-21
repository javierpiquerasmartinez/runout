import { useEffect, useRef, useState } from 'react'
import { reasonOf, type FailureReason } from '../backend/api'
import { useI18n } from '../i18n'
import { usePreferences } from '../preferences/context'
import { useSession } from './context'
import { googleClientId, loadGoogleIdentity } from './google'
import './GoogleSignInButton.css'

type Failure = FailureReason | 'google-unavailable' | 'google-not-configured'

/** The widest Google will draw its button. */
const MAX_WIDTH = 400

/**
 * Google's own "Sign in with Google" button. The ID token it hands back is
 * traded for an Account's session, and this browser becomes that Account.
 */
export function GoogleSignInButton() {
  const { t, locale } = useI18n()
  const { signIn } = useSession()
  const { theme } = usePreferences()
  const slot = useRef<HTMLDivElement>(null)
  const clientId = googleClientId()
  const [failure, setFailure] = useState<Failure | null>(clientId ? null : 'google-not-configured')

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    loadGoogleIdentity()
      .then((google) => {
        if (cancelled || !slot.current) return
        google.initialize({
          client_id: clientId,
          callback: ({ credential }) => {
            setFailure(null)
            signIn(credential).catch((error: unknown) => setFailure(reasonOf(error)))
          },
        })
        // As wide as the place it is given, as far as Google allows.
        const width = slot.current.clientWidth
        google.renderButton(slot.current, {
          type: 'standard',
          theme: theme === 'light' ? 'outline' : 'filled_black',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          ...(width > 0 && { width: Math.min(width, MAX_WIDTH) }),
          locale,
        })
      })
      .catch(() => !cancelled && setFailure('google-unavailable'))
    return () => {
      cancelled = true
    }
  }, [clientId, signIn, theme, locale])

  return (
    <div className="google-sign-in">
      <div ref={slot} className="google-sign-in__button" />
      {failure && (
        <p className="google-sign-in__error" role="alert">
          {failure === 'google-unavailable' || failure === 'google-not-configured'
            ? t(`identity.signIn.${failure}`)
            : t(`reason.${failure}`)}
        </p>
      )}
    </div>
  )
}
