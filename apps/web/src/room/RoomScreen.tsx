import { useEffect, useRef, useState } from 'react'
import { api, reasonOf, type FailureReason } from '../backend/api'
import { useI18n, type MessageKey } from '../i18n'
import type { Translator } from '../i18n/translator'
import { useSession } from '../identity/context'
import { Avatar } from '../ui/Avatar'
import { copyText } from '../ui/clipboard'
import { BrandMark } from '../ui/BrandMark'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { followLink } from '../routing'
import { playedAtLabel, positionsLabel, potLabel, stakeLabel, streetLabel } from './queueEntryView'
import type { Participant, QueueEntry, RoomView } from './roomClient'
import { formatRoomCode, roomLink } from './roomCode'

type InRoom = Extract<RoomView, { phase: 'in-room' }>

/**
 * The Room, as in the "Sala" boards: header, Queue panel, table and side panel.
 * Hands pasted anywhere in the Room (outside a field) go into the Queue.
 */
export function RoomScreen({ view }: { view: InRoom }) {
  const i18n = useI18n()
  const { t } = i18n
  const me = view.participants.find((p) => p.identityId === view.you)
  const isMaster = me?.role === 'master'
  const pasteOutcome = usePasteToImport(view.room.code)

  return (
    <div className="room">
      <RoomHeader view={view} isMaster={isMaster} />

      <div className="room__body">
        <aside className="room-queue" aria-labelledby="room-queue-title">
          <div className="room-panel__header">
            <h2 id="room-queue-title" className="room-panel__title">
              {t('room.queue.title')}
            </h2>
            <span className="room-queue__count ro-mono">{view.queue.length}</span>
          </div>
          {/* Always mounted, so screen readers announce the outcome when it appears. */}
          <p className="room-queue__status" role="status">
            {pasteOutcome}
          </p>
          {view.queue.length === 0 ? (
            <p className="room-queue__empty">{t('room.queue.empty')}</p>
          ) : (
            <ul className="room-queue__list">
              {view.queue.map((entry) => (
                <QueueRow key={entry.id} entry={entry} i18n={i18n} />
              ))}
            </ul>
          )}
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

function QueueRow({ entry, i18n }: { entry: QueueEntry; i18n: Translator }) {
  return (
    <li className="queue-entry">
      <div className="queue-entry__line">
        <Avatar name={entry.author.displayName} seed={entry.author.identityId} size={18} />
        <span className="queue-entry__author">{entry.author.displayName}</span>
        <span className="queue-entry__date ro-mono">{playedAtLabel(entry, i18n)}</span>
      </div>
      <div className="queue-entry__line">
        <span className="queue-entry__positions">{positionsLabel(entry)}</span>
        <span className="queue-entry__street ro-mono">{streetLabel(entry, i18n)}</span>
      </div>
      <div className="queue-entry__chips">
        <span className="queue-entry__chip ro-mono">{stakeLabel(entry)}</span>
        <span className="queue-entry__chip ro-mono">{potLabel(entry, i18n)}</span>
      </div>
    </li>
  )
}

type PasteOutcome =
  | { state: 'done'; imported: number; discarded: number }
  | { state: 'failed'; reason: FailureReason }

const OUTCOME_FOR_MS = 6000

/**
 * Imports whatever Hand History text is pasted while in the Room — no button,
 * as the issue asks. Pastes into a field (e.g. a Display Name) are left alone.
 * Returns a short-lived, human-readable outcome for the status line.
 */
function usePasteToImport(code: string): string | null {
  const { t } = useI18n()
  const { token } = useSession()
  const [outcome, setOutcome] = useState<PasteOutcome | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]')) return
      const text = event.clipboardData?.getData('text/plain')
      if (!text?.trim()) return
      event.preventDefault()
      api<{ imported: number; discarded: unknown[] }>(`/rooms/${encodeURIComponent(code)}/hands`, {
        token,
        method: 'POST',
        body: { text },
      })
        .then(({ imported, discarded }) => setOutcome({ state: 'done', imported, discarded: discarded.length }))
        .catch((error: unknown) => setOutcome({ state: 'failed', reason: reasonOf(error) }))
        .finally(() => {
          clearTimeout(timer.current)
          timer.current = setTimeout(() => setOutcome(null), OUTCOME_FOR_MS)
        })
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [code, token])

  if (!outcome) return null
  if (outcome.state === 'failed') return t(`reason.${outcome.reason}`)
  const parts: string[] = []
  if (outcome.imported > 0) {
    parts.push(t(outcome.imported === 1 ? 'room.queue.imported.one' : 'room.queue.imported.other', { count: outcome.imported }))
  }
  if (outcome.discarded > 0) {
    parts.push(t(outcome.discarded === 1 ? 'room.queue.discarded.one' : 'room.queue.discarded.other', { count: outcome.discarded }))
  }
  return parts.length > 0 ? parts.join(' · ') : t('room.queue.imported.none')
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
