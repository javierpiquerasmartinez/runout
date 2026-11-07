import { useEffect, useState, type FormEvent } from 'react'
import { api, reasonOf } from '../backend/api'
import { useI18n, type MessageKey } from '../i18n'
import { useSession } from '../identity/context'
import { useImpersonationLock } from '../identity/impersonationLock'
import { followLink, navigate } from '../routing'
import { RoomDialog } from '../room/RoomDialog'
import type { RoomState, RoomSummary } from '../room/roomClient'
import { roomLink, roomPath } from '../room/roomCode'
import { Button } from '../ui/Button'
import { copyText } from '../ui/clipboard'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { TextField } from '../ui/TextField'
import { requestNewRoom } from './rooms'
import './RoomsList.css'

/** Same limit the server enforces. */
const ROOM_NAME_MAX_LENGTH = 60

/** An open Room this person is a Participant of, as the server lists it: Live first, then by last activity. */
export interface OpenRoom extends RoomSummary {
  state: RoomState
  /** What this person is in it. */
  role: 'master' | 'guest'
  hands: number
  connected: number
  participants: number
  lastActivityAt: string
  /** The Master's Display Name. */
  master: string
}

/**
 * The Rooms screen once a person has any: the Rooms they lead and those they
 * take part in, each with what is going on in it and what they may do with
 * it, under a way to create a Room and to join one by code.
 */
export function RoomsList({
  rooms,
  onChange,
  creating,
}: {
  rooms: OpenRoom[]
  /** A Room renamed, or gone from the list (closed or left). */
  onChange: (rooms: OpenRoom[]) => void
  /** The create form, when it was asked for; shown above the list. */
  creating: React.ReactNode
}) {
  const { t } = useI18n()
  const led = rooms.filter((room) => room.role === 'master')
  const joined = rooms.filter((room) => room.role === 'guest')
  const renamed = (code: string, name: string) =>
    onChange(rooms.map((room) => (room.code === code ? { ...room, name } : room)))
  const gone = (code: string) => onChange(rooms.filter((room) => room.code !== code))

  return (
    <div className="rooms-list">
      <div className="rooms-list__bar">
        <Button variant="primary" onClick={requestNewRoom}>
          <Icon name="add" size={15} />
          {t('header.newRoom')}
        </Button>
        <CompactJoin />
      </div>
      {creating}
      {[
        { title: t('rooms.mine'), list: led },
        { title: t('rooms.joined'), list: joined },
      ].map(
        ({ title, list }) =>
          list.length > 0 && (
            <section key={title} className="rooms-list__group" aria-label={title}>
              <h2 className="rooms-list__title ro-mono">{title}</h2>
              <ul className="rooms-list__rows">
                {list.map((room) => (
                  <RoomRow key={room.code} room={room} onRenamed={renamed} onGone={gone} />
                ))}
              </ul>
            </section>
          ),
      )}
    </div>
  )
}

/** The decision a row is asking for right now, if any. */
type RowDecision = 'close' | 'leave' | null

function RoomRow({
  room,
  onRenamed,
  onGone,
}: {
  room: OpenRoom
  onRenamed: (code: string, name: string) => void
  onGone: (code: string) => void
}) {
  const { t, formatRelative } = useI18n()
  const [renaming, setRenaming] = useState(false)
  const [deciding, setDeciding] = useState<RowDecision>(null)
  const [copied, setCopied] = useState(false)
  const isMaster = room.role === 'master'

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = () => void copyText(roomLink(room.code)).then((done) => done && setCopied(true))

  return (
    <li className="room-row" data-live={room.state === 'live' || undefined}>
      <div className="room-row__main">
        {renaming ? (
          <RenameRoom
            room={room}
            onDone={(name) => {
              if (name) onRenamed(room.code, name)
              setRenaming(false)
            }}
          />
        ) : (
          <div className="room-row__heading">
            <a href={roomPath(room.code)} className="room-row__name" onClick={followLink}>
              {room.name}
            </a>
            {room.state === 'live' && (
              <span className="room-row__live">
                <span className="room-row__live-dot" aria-hidden="true" />
                {t('rooms.row.live')}
              </span>
            )}
          </div>
        )}
        <p className="room-row__meta">
          <span>{t(room.hands === 1 ? 'rooms.row.hands.one' : 'rooms.row.hands.other', { count: room.hands })}</span>
          <span aria-hidden="true">·</span>
          <span data-connected={room.connected > 0 || undefined} className="room-row__connected">
            {t('rooms.row.connected', { connected: room.connected, total: room.participants })}
          </span>
          <span aria-hidden="true">·</span>
          <span>{formatRelative(new Date(room.lastActivityAt))}</span>
          {!isMaster && (
            <>
              <span aria-hidden="true">·</span>
              <span>{t('rooms.row.master', { name: room.master })}</span>
            </>
          )}
        </p>
      </div>
      <div className="room-row__actions">
        <IconButton
          icon={copied ? 'success' : 'link'}
          label={t(copied ? 'rooms.row.linkCopied' : 'rooms.row.copyLink', { name: room.name })}
          size="compact"
          onClick={copy}
        />
        {isMaster && (
          <IconButton
            icon="note"
            label={t('rooms.row.rename', { name: room.name })}
            size="compact"
            onClick={() => setRenaming(true)}
          />
        )}
        <IconButton
          icon={isMaster ? 'delete' : 'close'}
          label={t(isMaster ? 'rooms.row.close' : 'rooms.row.leave', { name: room.name })}
          size="compact"
          onClick={() => setDeciding(isMaster ? 'close' : 'leave')}
        />
      </div>
      {deciding && (
        <RowDialog room={room} decision={deciding} onClose={() => setDeciding(null)} onGone={() => onGone(room.code)} />
      )}
    </li>
  )
}

/** The Room's name, editable in place: Enter saves, Escape leaves it as it was. */
function RenameRoom({ room, onDone }: { room: OpenRoom; onDone: (name: string | null) => void }) {
  const { t } = useI18n()
  const { token } = useSession()
  const [name, setName] = useState(room.name)
  const [error, setError] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (name.trim() === room.name) return onDone(null)
    setBusy(true)
    try {
      const renamed = await api<RoomSummary>(`/rooms/${encodeURIComponent(room.code)}`, {
        token: token ?? undefined,
        method: 'PATCH',
        body: { name },
      })
      onDone(renamed.name)
    } catch (caught) {
      setError(`reason.${reasonOf(caught)}`)
      setBusy(false)
    }
  }

  return (
    <form className="room-row__rename" onSubmit={save} noValidate>
      <TextField
        label={t('rooms.create.roomName')}
        value={name}
        maxLength={ROOM_NAME_MAX_LENGTH}
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && onDone(null)}
        error={error ? t(error) : undefined}
      />
      <Button type="submit" variant="secondary" size="compact" aria-busy={busy}>
        {t('rooms.row.save')}
      </Button>
      <Button type="button" variant="ghost" size="compact" onClick={() => onDone(null)}>
        {t('rooms.row.cancel')}
      </Button>
    </form>
  )
}

/** Closing a Room (the Master) or Leaving it (a Guest), once confirmed. */
function RowDialog({
  room,
  decision,
  onClose,
  onGone,
}: {
  room: OpenRoom
  decision: 'close' | 'leave'
  onClose: () => void
  onGone: () => void
}) {
  const { t } = useI18n()
  const { token } = useSession()
  const lost = useRoomHandsCount(room.code, decision === 'close')
  const [failure, setFailure] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState(false)

  async function act() {
    if (busy) return
    setBusy(true)
    const code = encodeURIComponent(room.code)
    try {
      await api(decision === 'close' ? `/rooms/${code}/close` : `/rooms/${code}/membership`, {
        token: token ?? undefined,
        method: decision === 'close' ? 'POST' : 'DELETE',
      })
      onClose()
      onGone()
    } catch (caught) {
      setFailure(`reason.${reasonOf(caught)}`)
      setBusy(false)
    }
  }

  return (
    <RoomDialog
      title={decision === 'close' ? t('room.close.title') : t('rooms.leave.title', { name: room.name })}
      body={decision === 'close' ? t('room.close.body') : t('rooms.leave.body')}
      onClose={onClose}
      actions={
        <Button variant="destructive" autoFocus aria-busy={busy} onClick={() => void act()}>
          {t(decision === 'close' ? 'room.close.confirm' : 'rooms.leave.confirm')}
        </Button>
      }
    >
      {decision === 'close' && lost !== 0 && (
        <p className="room-dialog__warning">
          {lost === undefined
            ? t('room.close.lost.counting')
            : lost === null
              ? t('room.close.lost.unknown')
              : t(lost === 1 ? 'room.close.lost.one' : 'room.close.lost.other', { count: lost })}
        </p>
      )}
      {failure && (
        <p className="room-dialog__warning" role="alert">
          {t(failure)}
        </p>
      )}
    </RoomDialog>
  )
}

/** How many of the Room's Hands are in nobody's Library: closing it loses them. */
function useRoomHandsCount(code: string, enabled: boolean): number | null | undefined {
  const { token } = useSession()
  const [count, setCount] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    if (!enabled) return
    let current = true
    api<{ count: number }>(`/rooms/${encodeURIComponent(code)}/room-hands`, { token: token ?? undefined })
      .then((answer) => current && setCount(answer.count))
      .catch(() => current && setCount(null))
    return () => {
      current = false
    }
  }, [code, token, enabled])
  return count
}

/** "Unirse con código", a single line above the list. */
function CompactJoin() {
  const { t } = useI18n()
  const { token } = useSession()
  const noRooms = useImpersonationLock('rooms')
  const [code, setCode] = useState('')
  const [error, setError] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState(false)

  async function join(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const typed = code.trim()
    if (typed === '') return setError('reason.room-not-found')
    setBusy(true)
    setError(null)
    try {
      const room = await api<RoomSummary>(`/rooms/${encodeURIComponent(typed)}`, { token: token ?? undefined })
      navigate(roomPath(room.code))
    } catch (caught) {
      setError(`reason.${reasonOf(caught)}`)
      setBusy(false)
    }
  }

  return (
    <form className="rooms-list__join" onSubmit={join} noValidate>
      <TextField
        className="rooms-list__code"
        label={t('rooms.join.code')}
        mono
        placeholder={t('rooms.join.codePlaceholder')}
        value={code}
        maxLength={12}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        onChange={(event) => {
          setCode(event.target.value)
          setError(null)
        }}
        error={error ? t(error) : undefined}
      />
      <Button type="submit" variant="sync" aria-busy={busy} disabledReason={noRooms}>
        {t('rooms.join.submit')}
      </Button>
    </form>
  )
}
