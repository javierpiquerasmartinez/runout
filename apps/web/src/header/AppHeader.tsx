import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { useSignOut } from '../identity/useSignOut'
import { roomPath } from '../room/roomCode'
import { followLink } from '../routing'
import { settingsPath } from '../settings/SettingsPage'
import { Avatar } from '../ui/Avatar'
import { Brand } from '../ui/Brand'
import { Icon } from '../ui/Icon'
import './AppHeader.css'

/**
 * The header of the Library, a Library Hand and Settings: the brand, where
 * the person is, a way back (to a Room still held, say) and, for an Account,
 * the avatar's menu. An anonymous Participant has no Sign-in to end, so no menu.
 */
export function AppHeader({ where, back }: { where: string; back?: ReactNode }) {
  const { identity } = useIdentity()
  return (
    <header className="app-header">
      <Brand />
      <span className="app-header__divider" aria-hidden="true" />
      <span className="app-header__where">{where}</span>
      <span className="app-header__spacer" />
      {back}
      {identity.account && <AccountMenu />}
    </header>
  )
}

/** Back to the Room still going on behind this page: live, so in sync teal. */
export function BackToRoom({ code, name }: { code: string; name: string }) {
  const { t } = useI18n()
  return (
    <a href={roomPath(code)} className="app-header__back-to-room" onClick={followLink}>
      <span className="app-header__live-dot" aria-hidden="true" />
      {t('header.backToRoom', { name })}
    </a>
  )
}

/** The avatar, opening onto the Display Name, Settings and signing out. */
function AccountMenu() {
  const { t } = useI18n()
  const { identity } = useIdentity()
  const { signOut, busy, failure } = useSignOut()
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const root = useRef<HTMLDivElement>(null)
  const name = identity.displayName ?? ''

  // A press anywhere else closes it.
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div
      ref={root}
      className="app-header__account"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      <button
        type="button"
        className="app-header__avatar"
        aria-label={t('header.accountMenu')}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        <Avatar name={name || '?'} seed={identity.id} size={28} />
      </button>
      {open && (
        <div id={menuId} className="app-header__menu" role="group" aria-label={t('header.accountMenu')}>
          <span className="app-header__menu-name">{name}</span>
          <hr className="app-header__menu-rule" />
          <a
            href={settingsPath}
            className="app-header__menu-item"
            onClick={(event) => {
              setOpen(false)
              followLink(event)
            }}
          >
            <Icon name="settings" size={16} />
            {t('room.settings')}
          </a>
          <button type="button" className="app-header__menu-item" disabled={busy} onClick={signOut}>
            {t('settings.account.signOut')}
          </button>
          {failure && (
            <p className="app-header__menu-failure" role="alert">
              {t('settings.account.signOutFailed', { reason: t(`reason.${failure}`) })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
