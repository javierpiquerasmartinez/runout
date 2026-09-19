import { useEffect, useRef, useState } from 'react'
import { useI18n, type MessageKey } from '../i18n'
import { Avatar } from '../ui/Avatar'
import { copyText } from '../ui/clipboard'
import { BrandMark } from '../ui/BrandMark'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { followLink } from '../routing'
import type { Participant, RoomView } from './roomClient'
import { formatRoomCode, roomLink } from './roomCode'

type InRoom = Extract<RoomView, { phase: 'in-room' }>

/**
 * The Room, as in the "Sala" boards: header, Queue panel, table and side panel.
 * The Queue and the table stay empty until Hands can be imported.
 */
export function RoomScreen({ view }: { view: InRoom }) {
  const { t } = useI18n()
  const me = view.participants.find((p) => p.identityId === view.you)
  const isMaster = me?.role === 'master'

  return (
    <div className="room">
      <RoomHeader view={view} isMaster={isMaster} />

      <div className="room__body">
        <aside className="room-queue" aria-labelledby="room-queue-title">
          <div className="room-panel__header">
            <h2 id="room-queue-title" className="room-panel__title">
              {t('room.queue.title')}
            </h2>
            <span className="room-queue__count ro-mono">0</span>
          </div>
          <p className="room-queue__empty">{t('room.queue.empty')}</p>
        </aside>

        <main className="room-stage">
          <div className="room-stage__felt">
            <div className="room-stage__table">
              <p>{t(isMaster ? 'room.table.waitingMaster' : 'room.table.waitingGuest')}</p>
            </div>
          </div>
        </main>

        <aside className="room-side" aria-labelledby="room-side-title">
          <div className="room-panel__header">
            <h2 id="room-side-title" className="room-panel__title">
              {t('room.details.title')}
            </h2>
          </div>
          <section className="room-side__section" aria-labelledby="room-participants-title">
            <h3 id="room-participants-title" className="room-side__title">
              {t('room.participants.title')}
            </h3>
            <ul className="room-participants" aria-live="polite">
              {view.participants.map((participant) => (
                <ParticipantRow key={participant.identityId} participant={participant} isYou={participant.identityId === view.you} />
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

function RoomHeader({ view, isMaster }: { view: InRoom; isMaster: boolean }) {
  const { t } = useI18n()
  const master = view.participants.find((p) => p.role === 'master')
  // Guests see the Master named apart, so the stack shows everyone else.
  const stacked = isMaster ? view.participants : view.participants.filter((p) => p.role !== 'master')
  const [copied, copy] = useCopied()

  return (
    <header className="room-header">
      <a href="/" className="room-header__brand" aria-label={t('room.home')} onClick={followLink}>
        <BrandMark size={22} />
        <span className="ro-serif">{t('brand.wordmark')}</span>
      </a>
      <span className="room-header__divider" />
      <h1 className="room-header__name">{view.room.name}</h1>
      <span className="room-header__code">
        <span className="ro-mono">{formatRoomCode(view.room.code)}</span>
        <IconButton
          icon={copied === 'code' ? 'success' : 'copy'}
          label={t(copied === 'code' ? 'room.codeCopied' : 'room.copyCode')}
          size="compact"
          className="room-header__copy-code"
          onClick={() => copy('code', formatRoomCode(view.room.code))}
        />
      </span>
      {isMaster && (
        <Button
          variant="secondary"
          size="compact"
          className="room-header__copy-link"
          data-copied={copied === 'link' || undefined}
          onClick={() => copy('link', roomLink(view.room.code))}
        >
          <Icon name={copied === 'link' ? 'success' : 'link'} size={14} />
          {t(copied === 'link' ? 'room.linkCopied' : 'room.copyLink')}
        </Button>
      )}
      <span className="ro-visually-hidden" role="status">
        {copied && t(copied === 'link' ? 'room.linkCopied' : 'room.codeCopied')}
      </span>

      <span className="room-header__spacer" />

      <span className="room-header__live" data-offline={!view.connected || undefined}>
        <span className="room-header__live-dot" />
        {t(view.connected ? 'room.live' : 'room.offline')}
      </span>
      {!isMaster && master && (
        <span className="room-header__master">
          <Avatar name={master.displayName} seed={master.identityId} size={20} />
          <span>
            {t('room.masterIs')} <strong>{master.displayName}</strong>
          </span>
        </span>
      )}
      <span className="room-header__people">
        <span className="ro-avatar-stack">
          {stacked.map((p) => (
            <Avatar key={p.identityId} name={p.displayName} seed={p.identityId} />
          ))}
        </span>
        <span className="room-header__count">{t('room.inRoom', { count: view.participants.length })}</span>
      </span>
      <span className="room-header__role" data-role={isMaster ? 'master' : 'guest'}>
        <Icon name={isMaster ? 'master' : 'profile'} size={14} />
        {t(isMaster ? 'room.master' : 'room.guest')}
      </span>
    </header>
  )
}

function ParticipantRow({ participant, isYou }: { participant: Participant; isYou: boolean }) {
  const { t } = useI18n()
  const role: MessageKey = participant.role === 'master' ? 'room.master' : 'room.guest'
  return (
    <li className="room-participant">
      <Avatar name={participant.displayName} seed={participant.identityId} />
      <span className="room-participant__who">
        <span className="room-participant__name">
          {participant.displayName}
          {isYou && <span className="room-participant__you">{t('room.you')}</span>}
        </span>
        <span className="room-participant__role">{t(role)}</span>
      </span>
      <span className="room-participant__presence" title={t('room.participants.present')}>
        <span className="ro-visually-hidden">{t('room.participants.present')}</span>
      </span>
    </li>
  )
}

const COPIED_FOR_MS = 2000

/** Copies text to the clipboard and remembers, briefly, which thing was copied. */
type Copyable = 'code' | 'link'

function useCopied(): [Copyable | null, (what: Copyable, text: string) => void] {
  const [copied, setCopied] = useState<Copyable | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  function copy(what: Copyable, text: string) {
    void copyText(text).then((done) => {
      // If copying is impossible the code stays on screen to copy by hand.
      if (!done) return
      setCopied(what)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), COPIED_FOR_MS)
    })
  }
  return [copied, copy]
}
