import { useEffect, useState, type FormEvent } from 'react'
import { api, reasonOf } from '../backend/api'
import { useI18n, type MessageKey } from '../i18n'
import { useSession } from '../identity/context'
import { GoogleSignInButton } from '../identity/GoogleSignInButton'
import { DISPLAY_NAME_MAX_LENGTH } from '../identity/identity'
import { followLink, navigate } from '../routing'
import type { RoomSummary } from '../room/roomClient'
import type { JoinIntent } from '../room/joinIntent'
import { roomPath } from '../room/roomCode'
import { libraryPath } from '../library/library'
import { Button } from '../ui/Button'
import { BrandMark } from '../ui/BrandMark'
import { Icon } from '../ui/Icon'
import { TextField } from '../ui/TextField'
import { WelcomePreview } from './WelcomePreview'
import './WelcomePage.css'

/** Same limit the server enforces. */
const ROOM_NAME_MAX_LENGTH = 60

/** An open Room this person has been in, as the server lists it. */
interface OpenRoom extends RoomSummary {
  /** Whether anyone is connected to it right now. */
  live: boolean
  /** When they first arrived in it, kept across rejoins, as an ISO instant. */
  joinedAt: string
}

export function WelcomePage() {
  const { t } = useI18n()
  const { token, identity } = useSession()
  return (
    <main className="welcome">
      <div className="welcome__entry">
        <div className="welcome__brand">
          <BrandMark />
          <span className="welcome__wordmark ro-serif">{t('brand.wordmark')}</span>
          <span className="welcome__beta ro-mono">{t('brand.beta')}</span>
          {/* Only an Account has a Library (ADR 0005). */}
          {identity?.account && (
            <a href={libraryPath} className="welcome__library" onClick={followLink}>
              <Icon name="library" size={16} />
              {t('welcome.library')}
            </a>
          )}
        </div>

        <div className="welcome__intro">
          <h1 className="welcome__title ro-serif">{t('welcome.title')}</h1>
          <p className="welcome__lead">{t('welcome.lead')}</p>
        </div>

        <div className="welcome__actions">
          <CreateRoomCard />
          <div className="welcome__or" aria-hidden="true">
            <span />
            {t('welcome.or')}
            <span />
          </div>
          <JoinRoomCard />
        </div>

        {/* An anonymous identity only ever has its own Room: the list is for Accounts. */}
        {identity?.account && <RecentRooms token={token} />}
      </div>

      <WelcomePreview />
    </main>
  )
}

/**
 * "Tus salas recientes" from the welcome board: the open Rooms this person
 * has been in, the live ones marked. A closed Room never reopens, so it is
 * not listed; neither is one they were removed from.
 */
function RecentRooms({ token }: { token: string }) {
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
      ? t('welcome.rooms.justNow')
      : formatRelative(joined, listedAt)
  }

  return (
    <section className="welcome__rooms" aria-labelledby="welcome-rooms-title">
      <span id="welcome-rooms-title" className="welcome__rooms-title ro-mono">
        {t('welcome.rooms.title')}
      </span>
      <ul className="welcome-rooms">
        {rooms.map((room) => (
          <li key={room.code}>
            <a
              href={roomPath(room.code)}
              className="welcome-room"
              data-live={room.live || undefined}
              aria-label={t('welcome.rooms.open', { name: room.name })}
              onClick={followLink}
            >
              <span className="welcome-room__dot" aria-hidden="true" />
              <span className="welcome-room__name">{room.name}</span>
              {room.live ? (
                <span className="welcome-room__live">{t('welcome.rooms.live')}</span>
              ) : (
                <span className="welcome-room__when ro-mono">{inRoomSince(room.joinedAt)}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CreateRoomCard() {
  const { t } = useI18n()
  const { token, identity, rememberDisplayName } = useSession()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState(identity?.displayName ?? '')
  const [error, setError] = useState<{ field: 'name' | 'displayName' | 'form'; message: MessageKey } | null>(null)
  const [busy, setBusy] = useState(false)
  // Creating a Room needs an Account (ADR 0005): without one, sign in first.
  const signedIn = Boolean(identity?.account)

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
    <form className="welcome-card" onSubmit={create} noValidate>
      <div className="welcome-card__heading">
        <h2 className="welcome-card__title">{t('welcome.create.title')}</h2>
        <p className="welcome-card__body">{t(signedIn ? 'welcome.create.body' : 'welcome.signIn.body')}</p>
      </div>
      <div className="welcome-card__fields">
        <TextField
          label={t('welcome.create.roomName')}
          placeholder={t('welcome.create.roomNamePlaceholder')}
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
        aria-label={t('welcome.create.submit')}
        disabledReason={signedIn ? undefined : t('reason.account-required')}
      >
        <Icon name="add" size={16} />
        {t('welcome.create.submit')}
      </Button>
      {error?.field === 'form' && (
        <p className="welcome-card__error" role="alert">
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
    <form className="welcome-card welcome-card--join" onSubmit={join} noValidate>
      <div className="welcome-card__heading">
        <h2 className="welcome-card__title">{t('welcome.join.title')}</h2>
        <p className="welcome-card__body">{t('welcome.join.body')}</p>
      </div>
      <div className="welcome-join">
        <TextField
          className="welcome-join__code"
          label={t('welcome.join.code')}
          mono
          placeholder={t('welcome.join.codePlaceholder')}
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
        <Button type="submit" variant="sync" size="prominent" className="welcome-join__submit" aria-busy={busy}>
          {t('welcome.join.submit')}
        </Button>
      </div>
      <p className="welcome-card__hint">{t('welcome.join.linkHint')}</p>
    </form>
  )
}
