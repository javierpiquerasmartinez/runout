import { useI18n } from '../i18n'
import { useSession } from './context'

/**
 * Why a control is locked while an Administrator impersonates this Account
 * (ADR 0008), or undefined for its owner: pass it as `disabledReason`.
 * Rooms are never entered so, nor Support written in; nor is how the Account
 * signs in changed.
 */
export function useImpersonationLock(what: 'rooms' | 'support' | 'access'): string | undefined {
  const { t } = useI18n()
  const { identity } = useSession()
  if (!identity?.impersonation) return undefined
  if (what === 'rooms') return t('impersonation.noRooms')
  return what === 'support' ? t('impersonation.noSupport') : t('impersonation.notAllowed')
}
