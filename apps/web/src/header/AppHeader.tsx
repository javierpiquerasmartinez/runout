import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { adminPath } from '../admin/admin'
import { calendarPath } from '../calendar/calendar'
import { goalsPath } from '../goals/goals'
import { homePath } from '../home/home'
import { useI18n } from '../i18n'
import { useIdentity } from '../identity/context'
import { useImpersonationLock } from '../identity/impersonationLock'
import { useSignOut } from '../identity/useSignOut'
import { labAnalysisPath } from '../lab/lab'
import { libraryPath } from '../library/library'
import { roomPath } from '../room/roomCode'
import { requestNewRoom, roomsPath } from '../rooms/rooms'
import { followLink } from '../routing'
import { settingsPath } from '../settings/SettingsPage'
import { Avatar } from '../ui/Avatar'
import { Brand } from '../ui/Brand'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import './AppHeader.css'

/** The screens of the header's navigation. */
type Section = 'home' | 'library' | 'rooms' | 'lab' | 'calendar' | 'goals'

/**
 * The header of the Account side (Home, the Library, the Rooms screen, the Lab, the Calendar, Goals, Settings) and of
 * Settings opened from a Room. An Account gets the brand leading to its
 * Home, the navigation with the `current` section marked, `where` for a
 * screen outside it, a way back (to a Room still held, say), "Nueva sala" and
 * the avatar's menu. An anonymous Participant gets only the brand, `where`
 * and the way back: no Library, no Rooms to create, no Sign-in to end.
 */
export function AppHeader({ current, where, back }: { current?: Section; where?: string; back?: ReactNode }) {
  const { t } = useI18n()
  const { identity } = useIdentity()
  const account = Boolean(identity.account)
  const noRooms = useImpersonationLock('rooms')
  return (
    <header className="app-header">
      {account ? <Brand href={homePath} label={t('header.brandToHome')} /> : <Brand />}
      <span className="app-header__divider" aria-hidden="true" />
      {account && <SectionNav current={current} />}
      {account && where && <span className="app-header__divider" aria-hidden="true" />}
      {where && <span className="app-header__where">{where}</span>}
      <span className="app-header__spacer" />
      {back}
      {account && (
        <Button
          variant="primary"
          size="compact"
          className="app-header__new-room"
          aria-label={noRooms ? t('header.newRoom') : undefined}
          disabledReason={noRooms}
          onClick={requestNewRoom}
        >
          <Icon name="add" size={14} />
          <span className="app-header__new-room-label">{t('header.newRoom')}</span>
        </Button>
      )}
      {account && <AccountMenu />}
    </header>
  )
}

/**
 * "Inicio · Biblioteca · Salas · Laboratorio · Calendario · Objetivos", the section this person is
 * in marked. Where they don't all fit (a phone), they scroll sideways, opening
 * with the current one in view, and fade out on the side where more are hidden.
 */
function SectionNav({ current }: { current?: Section }) {
  const { t } = useI18n()
  const nav = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const element = nav.current
    if (!element) return
    const marked = element.querySelector<HTMLElement>('[aria-current="page"]')
    if (marked) {
      const end = marked.offsetLeft + marked.offsetWidth
      if (end > element.scrollLeft + element.clientWidth) element.scrollLeft = end - element.clientWidth
      else if (marked.offsetLeft < element.scrollLeft) element.scrollLeft = marked.offsetLeft
    }
    markHiddenSections(element)
    const resized = () => markHiddenSections(element)
    window.addEventListener('resize', resized)
    return () => window.removeEventListener('resize', resized)
  }, [current])

  const sections: { section: Section; href: string; label: string }[] = [
    { section: 'home', href: homePath, label: t('header.nav.home') },
    { section: 'library', href: libraryPath, label: t('header.nav.library') },
    { section: 'rooms', href: roomsPath, label: t('header.nav.rooms') },
    { section: 'lab', href: labAnalysisPath, label: t('header.nav.lab') },
    { section: 'calendar', href: calendarPath, label: t('header.nav.calendar') },
    { section: 'goals', href: goalsPath, label: t('header.nav.goals') },
  ]
  return (
    <nav ref={nav} className="app-header__nav" aria-label={t('header.nav')} onScroll={(event) => markHiddenSections(event.currentTarget)}>
      {sections.map(({ section, href, label }) => (
        <a
          key={section}
          href={href}
          className="app-header__nav-item"
          aria-current={section === current ? 'page' : undefined}
          onClick={followLink}
        >
          {label}
        </a>
      ))}
    </nav>
  )
}

/** Marks the sides of the scrolled sections where some are out of view, so they fade out there. */
function markHiddenSections(nav: HTMLElement) {
  nav.toggleAttribute('data-hidden-start', nav.scrollLeft > 0)
  nav.toggleAttribute('data-hidden-end', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1)
}

/** Back to the Room still going on behind this page: live, so in sync teal. */
export function BackToRoom({ code, name }: { code: string; name: string }) {
  const { t } = useI18n()
  return (
    <a href={roomPath(code)} className="app-header__back-to-room" onClick={followLink}>
      <span className="app-header__live-dot" aria-hidden="true" />
      <span className="app-header__back-label">{t('header.backToRoom', { name })}</span>
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
          {identity.administrator && (
            <a
              href={adminPath}
              className="app-header__menu-item"
              onClick={(event) => {
                setOpen(false)
                followLink(event)
              }}
            >
              <Icon name="administration" size={16} />
              {t('header.administration')}
            </a>
          )}
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
