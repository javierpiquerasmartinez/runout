import { useState } from 'react'
import { useI18n } from '../i18n'
import { navigate } from '../routing'
import { Button } from '../ui/Button'
import { useSession } from './context'
import './ImpersonationBanner.css'

/** Where "Salir" takes the Administrator back to, as themselves. */
const BACK_TO = '/admin/accounts'

/**
 * Fixed at the top of every screen while an Administrator uses Runout as
 * someone else, so they never forget whose Account they are in.
 */
export function ImpersonationBanner() {
  const { t } = useI18n()
  const { identity, stopImpersonating } = useSession()
  const [busy, setBusy] = useState(false)
  if (!identity?.impersonation) return null
  const name = identity.displayName ?? identity.account?.email ?? ''
  return (
    <div className="impersonation-banner" role="status">
      <span className="impersonation-banner__text">{t('impersonation.banner', { name })}</span>
      <Button
        variant="secondary"
        size="compact"
        aria-busy={busy}
        onClick={() => {
          setBusy(true)
          stopImpersonating()
            .then(() => navigate(BACK_TO))
            .catch(() => setBusy(false))
        }}
      >
        {t('impersonation.leave')}
      </Button>
    </div>
  )
}
