import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, reasonOf } from '../backend/api'
import { useI18n, type MessageKey } from '../i18n'
import { useSession } from '../identity/context'
import { GoogleSignInButton } from '../identity/GoogleSignInButton'
import { DISPLAY_NAME_MAX_LENGTH } from '../identity/identity'
import { followLink, navigate } from '../routing'
import type { RoomSummary } from '../room/roomClient'
import type { JoinIntent } from '../room/joinIntent'
import { roomPath } from '../room/roomCode'
import { forgetNewRoomRequest } from './rooms'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { TextField } from '../ui/TextField'
import './RoomForms.css'

/** Same limit the server enforces. */
const ROOM_NAME_MAX_LENGTH = 60

/** An open Room this person has been in, as the server lists it. */
interface OpenRoom extends RoomSummary {
  /** Whether anyone is connected to it right now. */
  live: boolean
  /** When they first arrived in it, kept across rejoins, as an ISO instant. */
  joinedAt: string
}

/**
 * The two ways into a Room: create one, becoming its Master, or join one by
 * its code. A new `focusCreate` mark focuses the new Room's name.
 */
export function RoomForms({ focusCreate = null }: { focusCreate?: number | null }) {
  const { t } = useI18n()
  return (
    <div className="room-forms">
      <CreateRoomCard focus={focusCreate} />
      <div className="room-forms__or" aria-hidden="true">
        <span />
        {t('rooms.or')}
        <span />
      </div>
      <JoinRoomCard />
    </div>
  )
}

/**
 * "Tus salas recientes" from the welcome board: the open Rooms this person
 * has been in, the live ones marked. A closed Room never reopens, so it is
 * not listed; neither is one they were removed from.
 */
export function RecentRooms({ token }: { token: string }) {
  const { t, formatRelative } = useI18n()
  // The moment the list arrived, so every "how long ago" is read from one clock.
  const [listed, setListed] = useState<{ rooms: OpenRoom[]; at: Date } | null>(null)

  useEffect(() => {
    let cancelled = false
    api<OpenRoom[]>('/rooms', { token })
      .then((rooms) => !cancelled && setListed({ rooms, at: new Date() }))
      // Nothing to show is the same as nothing to say: the list stays away.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token])

  if (!listed || listed.rooms.length === 0) return null
  const { rooms, at: listedAt } = listed

  /**
   * How long they have been a Participant of it: `joinedAt` is their first
   * arrival, which the Room keeps across rejoins. "Hace un momento" inside
   * the minute, where the locale would say "este minuto".
   */
  function inRoomSince(joinedAt: string): string {
    const joined = new Date(joinedAt)
    return listedAt.getTime() - joined.getTime() < 60_000
      ? t('rooms.recent.justNow')
      : formatRelative(joined, listedAt)
  }

  return (
    <section className="recent-rooms" aria-labelledby="recent-rooms-title">
      <span id="recent-rooms-title" className="recent-rooms__title ro-mono">
        {t('rooms.recent.title')}
      </span>
      <ul className="recent-rooms__list">
        {rooms.map((room) => (
          <li key={room.code}>
            <a
              href={roomPath(room.code)}
              className="recent-room"
              data-live={room.live || undefined}
              aria-label={t('rooms.recent.open', { name: room.name })}
              onClick={followLink}
            >
              <span className="recent-room__dot" aria-hidden="true" />
              <span className="recent-room__name">{room.name}</span>
              {room.live ? (
                <span className="recent-room__live">{t('rooms.recent.live')}</span>
              ) : (
                <span className="recent-room__when ro-mono">{inRoomSince(room.joinedAt)}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CreateRoomCard({ focus }: { focus: number | null }) {
  const { t } = useI18n()
  const { token, identity, rememberDisplayName } = useSession()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState(identity?.displayName ?? '')
  const [error, setError] = useState<{ field: 'name' | 'displayName' | 'form'; message: MessageKey } | null>(null)
  const [busy, setBusy] = useState(false)
  const nameField = useRef<HTMLInputElement>(null)
  // Creating a Room needs an Account (ADR 0005): without one, sign in first.
  const signedIn = Boolean(identity?.account)

  useEffect(() => {
    if (focus === null) return
    nameField.current?.focus()
    forgetNewRoomRequest()
  }, [focus])

  async function create(event: FormEvent) {
    event.preventDefault()
    if (busy || !signedIn) return
    setBusy(true)
    setError(null)
    try {
      const room = await api<RoomSummary>('/rooms', { token: token ?? undefined, method: 'POST', body: { name, displayName } })
      const trimmed = displayName.trim()
      rememberDisplayName(trimmed)
      navigate(roomPath(room.code), { displayName: trimmed } satisfies JoinIntent)
    } catch (caught) {
      const reason = reasonOf(caught)
      const field = reason === 'invalid-room-name' ? 'name' : reason === 'invalid-display-name' ? 'displayName' : 'form'
      setError({ field, message: `reason.${reason}` })
      setBusy(false)
    }
  }

  return (
    <form className="room-form" onSubmit={create} noValidate>
      <div className="room-form__heading">
        <h2 className="room-form__title">{t('rooms.create.title')}</h2>
        <p className="room-form__body">{t(signedIn ? 'rooms.create.body' : 'rooms.create.signIn')}</p>
      </div>
      <div className="room-form__fields">
        <TextField
          ref={nameField}
          label={t('rooms.create.roomName')}
          placeholder={t('rooms.create.roomNamePlaceholder')}
          value={name}
          maxLength={ROOM_NAME_MAX_LENGTH}
          onChange={(event) => setName(event.target.value)}
          error={error?.field === 'name' ? t(error.message) : undefined}
        />
        <TextField
          label={t('welcome.displayName')}
          value={displayName}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoComplete="nickname"
          onChange={(event) => setDisplayName(event.target.value)}
          error={error?.field === 'displayName' ? t(error.message) : undefined}
        />
      </div>
      {/* Without an Account, signing in is what the card asks for first. */}
      {!signedIn && <GoogleSignInButton />}
      <Button
        type="submit"
        variant="primary"
        size="prominent"
        aria-busy={busy}
        aria-label={t('rooms.create.submit')}
        disabledReason={signedIn ? undefined : t('reason.account-required')}
      >
        <Icon name="add" size={16} />
        {t('rooms.create.submit')}
      </Button>
      {error?.field === 'form' && (
        <p className="room-form__error" role="alert">
          {t(error.message)}
        </p>
      )}
    </form>
  )
}

function JoinRoomCard() {
  const { t } = useI18n()
  const { token } = useSession()
  const [code, setCode] = useState('')
  const [error, setError] = useState<MessageKey | null>(null)
  const [busy, setBusy] = useState(false)

  async function join(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const typed = code.trim()
    if (typed === '') {
      setError('reason.room-not-found')
      return
    }
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
    <form className="room-form room-form--join" onSubmit={join} noValidate>
      <div className="room-form__heading">
        <h2 className="room-form__title">{t('rooms.join.title')}</h2>
        <p className="room-form__body">{t('rooms.join.body')}</p>
      </div>
      <div className="room-code">
        <TextField
          className="room-code__code"
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
        <Button type="submit" variant="sync" size="prominent" className="room-code__submit" aria-busy={busy}>
          {t('rooms.join.submit')}
        </Button>
      </div>
      <p className="room-form__hint">{t('rooms.join.linkHint')}</p>
    </form>
  )
}
